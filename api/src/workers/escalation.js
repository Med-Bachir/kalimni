// Escalation worker (Phase 1.1 + 1.2). Two jobs, one sweep, every minute:
//
//   1. No open safety alert may rot. The audit trail in alert_escalations
//      says who has been paged; this sweep compares it against the alert's
//      age and escalates:
//        t+0   — paged at creation by alertService (tier 0). If that page is
//                missing (alert predates the ladder, or creation crashed
//                mid-way), it is delivered here.
//        t+15m — unacknowledged: re-page the tier-0 targets AND bring in the
//                tier-2 on-call backup (tier 1 rows, method 'repage').
//        t+60m — unacknowledged: page EVERY admin (tier 2, method
//                'critical'); the admin dashboard shows an undismissable
//                banner until the alert is acknowledged.
//      (SMS delivery has no provider in this stack yet; when one exists it
//      plugs into pageUsers() — the audit rows and timing stay identical.)
//
//   2. Failed LLM risk scans (risk_scan_failures) are retried, so a
//      transient provider outage never permanently skips a message.
//
// sweepOnce(now) is pure-ish and injectable for tests; start() wires the
// interval and is called from index.js only.
const repos = require('../data/repos');
const { emitToUser, emitToAdmins } = require('../realtime');
const push = require('./../services/pushService');
const risk = require('../services/riskService');
const voiceScreening = require('../services/voiceScreeningService');
const journalScreening = require('../services/journalScreeningService');
const { voiceFilePath } = require('../utils/mediaStore');

const SWEEP_INTERVAL_MS = 60_000;
const TIER1_AFTER_MS = 15 * 60_000;
const TIER2_AFTER_MS = 60 * 60_000;
const RETRY_BATCH = 10;
const RETRY_MAX_ATTEMPTS = 5;

let lastSweepAt = null;
const healthSnapshot = () => ({ lastSweepAt });

async function pageUsers(alert, patient, userIds, tier, method) {
  for (const id of userIds) {
    await repos.insertAlertEscalation({ alertId: alert.id, tier, notifiedId: id, method });
    emitToUser(id, 'safety:alert', { alert, escalated: tier });
  }
  if (userIds.length) {
    push.pushSafetyAlert({ alert, patient, recipients: userIds }); // fire-and-forget
  }
}

async function escalateAlert(alert, now) {
  const patient = await repos.findUserById(alert.patientId);
  if (!patient) return; // account deleted; cascade will have removed the alert shortly
  const escalations = await repos.escalationsOf(alert.id);
  const pages = escalations.filter((e) => e.method !== 'ack');
  const maxTier = pages.length ? Math.max(...pages.map((e) => e.tier)) : -1;
  const age = now - new Date(alert.createdAt).getTime();

  if (maxTier < 0) {
    // Alert exists with no page at all — deliver tier 0 late, loudly.
    console.warn(`[escalation] alert ${alert.id} had no tier-0 page — delivering now`);
    const targets = alert.specialistId
      ? [alert.specialistId]
      : (await repos.onCallSpecialistsAt(new Date(now).toISOString(), 1)).map((r) => r.specialistId);
    const ids = targets.length ? targets : await repos.listAdminIds();
    await pageUsers(alert, patient, ids, 0, 'page');
    return;
  }

  if (age >= TIER2_AFTER_MS && maxTier < 2) {
    // A crisis alert has sat unacknowledged for an hour. Everyone hears it.
    const admins = await repos.listAdminIds();
    console.error(`[escalation] alert ${alert.id} CRITICAL — open ${Math.round(age / 60000)}min, paging ${admins.length} admin(s)`);
    await pageUsers(alert, patient, admins, 2, 'critical');
    emitToAdmins('safety:critical', { alert });
    return;
  }

  if (age >= TIER1_AFTER_MS && maxTier < 1) {
    // Re-page the original targets and add the tier-2 on-call backup.
    const original = [...new Set(pages.map((e) => e.notifiedId).filter(Boolean))];
    const backup = (await repos.onCallSpecialistsAt(new Date(now).toISOString(), 2)).map((r) => r.specialistId);
    const ids = [...new Set([...original, ...backup])];
    console.warn(`[escalation] alert ${alert.id} unacknowledged ${Math.round(age / 60000)}min — re-paging ${ids.length} target(s)`);
    await pageUsers(alert, patient, ids.length ? ids : await repos.listAdminIds(), 1, 'repage');
  }
}

async function retryRiskScan(failure) {
  if (failure.kind === 'journal') {
    const entry = await repos.findJournalEntry(failure.journalEntryId);
    const user = entry && (await repos.findUserById(entry.userId));
    if (!entry || !user) return repos.resolveRiskScanFailure(failure.id); // entry/account gone
    if (await journalScreening.classifyJournalAsync({ entry, user })) {
      await repos.resolveRiskScanFailure(failure.id);
    }
    return undefined;
  }

  const message = await repos.findMessage(failure.messageId);
  if (!message) return repos.resolveRiskScanFailure(failure.id); // message gone
  const conversation = await repos.findConversation(message.conversationId);
  const sender = await repos.findUserById(message.senderId);
  if (!conversation || !sender) return repos.resolveRiskScanFailure(failure.id);

  let ok = false;
  if (failure.kind === 'voice') {
    // Reuse a stored transcript when transcription already succeeded — the
    // failure was in classification; otherwise redo the whole pipeline.
    const transcript = await repos.getVoiceTranscript(message.id);
    if (transcript?.status === 'done' && transcript.text) {
      ok = await risk.scanMessageAsync({ message, sender, conversation, text: transcript.text });
    } else {
      ok = await voiceScreening.screenVoiceMessageAsync({
        message, sender, conversation, filePath: voiceFilePath(message.audioUrl),
      });
    }
  } else {
    ok = await risk.scanMessageAsync({ message, sender, conversation });
  }
  // Failure bookkeeping (attempts bump) already happened inside the scan's
  // own catch via upsertRiskScanFailure.
  if (ok) await repos.resolveRiskScanFailure(failure.id);
  return undefined;
}

/** One pass. `now` is injectable for tests. Returns counts for logging. */
async function sweepOnce(now = Date.now()) {
  const stats = { alerts: 0, retries: 0 };

  const open = await repos.openSafetyAlerts();
  stats.alerts = open.length;
  for (const alert of open) {
    try {
      await escalateAlert(alert, now);
    } catch (err) {
      console.error(`[escalation] alert ${alert.id} sweep failed:`, err.message);
    }
  }

  const failures = await repos.openRiskScanFailures(RETRY_BATCH, RETRY_MAX_ATTEMPTS);
  stats.retries = failures.length;
  for (const failure of failures) {
    try {
      await retryRiskScan(failure);
    } catch (err) {
      console.error(`[escalation] risk retry ${failure.id} failed:`, err.message);
    }
  }

  lastSweepAt = new Date(now).toISOString();
  return stats;
}

let timer = null;
function start(intervalMs = SWEEP_INTERVAL_MS) {
  if (timer) return timer;
  timer = setInterval(() => {
    sweepOnce().catch((err) => console.error('[escalation] sweep crashed:', err.message));
  }, intervalMs);
  timer.unref(); // never keep the process alive on its own
  console.log(`[escalation] worker started — sweep every ${Math.round(intervalMs / 1000)}s`);
  return timer;
}

module.exports = { sweepOnce, start, healthSnapshot, TIER1_AFTER_MS, TIER2_AFTER_MS };
