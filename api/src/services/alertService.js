// Single birth-point for safety alerts (Phase 1.1). Every layer that detects
// risk — keyword scan, LLM classifier, voice screening, questionnaire item 9,
// the AI companion — raises its alert HERE, so three guarantees hold in one
// place and cannot drift:
//   1. Someone concrete is paged at t+0: the assigned specialist, or the
//      tier-1 on-call specialist for unassigned patients, or (last resort,
//      loudly) every admin.
//   2. Every page is recorded in alert_escalations — the append-only audit
//      the 15/60-minute escalation worker (workers/escalation.js) reads.
//   3. Admin dashboards always hear about the alert over the socket.
//
// alert.specialist_id stays "the treating clinician" (NULL for unassigned
// patients) — on-call visibility and ack rights flow from the escalation
// audit rows, not from mutating the assignment.
const repos = require('../data/repos');
const { emitToUser, emitToAdmins } = require('./../realtime');
const push = require('./pushService');

/**
 * Creates the alert, pages the tier-0 target, records the audit row.
 * `patient` is the full user row (assignment read from it); `message` is an
 * optional chat-message row echoed to the specialist UI with the socket event.
 * Returns the stored alert.
 */
async function raiseAlert({ patient, source, messageId = null, resultId = null, detail = null, message = null }) {
  const alert = await repos.insertSafetyAlert({
    patientId: patient.id,
    specialistId: patient.assignedSpecialistId || null,
    messageId,
    resultId,
    source,
    status: 'open',
    detail,
  });

  // Tier-0 target: assigned specialist, else whoever is on call (tier 1).
  let targetIds = alert.specialistId ? [alert.specialistId] : [];
  if (!targetIds.length) {
    const onCall = await repos.onCallSpecialistsAt(new Date().toISOString(), 1);
    targetIds = onCall.map((r) => r.specialistId);
  }
  // Nobody assigned and an empty rota: page every admin rather than nobody.
  const adminFallback = !targetIds.length;
  if (adminFallback) {
    targetIds = await repos.listAdminIds();
    console.warn(`[alert] ${alert.id}: no assigned specialist and empty on-call rota — paging ${targetIds.length} admin(s)`);
  }

  for (const id of targetIds) {
    await repos.insertAlertEscalation({ alertId: alert.id, tier: 0, notifiedId: id, method: 'page' });
    emitToUser(id, 'safety:alert', { alert, message });
  }
  if (!targetIds.length) {
    // Truly nobody to page (no admins either) — keep the audit honest.
    await repos.insertAlertEscalation({ alertId: alert.id, tier: 0, notifiedId: null, method: 'page' });
    console.error(`[alert] ${alert.id}: NOBODY available to page — alert is waiting on the escalation worker`);
  }
  emitToAdmins('safety:alert', { alert, message });
  push.pushSafetyAlert({ alert, patient, recipients: targetIds }); // fire-and-forget

  return alert;
}

module.exports = { raiseAlert };
