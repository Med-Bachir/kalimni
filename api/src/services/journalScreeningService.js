// Safety screening for daily check-in journal notes (Phase 1.4). The note is
// the most intimate free text in the system and was stored with zero
// screening — a patient writing their crisis into the journal instead of a
// chat triggered nothing.
//
// Same two layers as everywhere else:
//   layer 1 — keyword scan, synchronous with the save (screenJournalEntry is
//             awaited by the route; a hit raises the alert before the
//             response returns).
//   layer 2 — LLM classifier, fire-and-forget with a dead letter on failure
//             (classifyJournalAsync; retried by the escalation worker).
//
// Journal alerts NEVER pause anything for the patient — no hold, no banner
// interrupting them. The specialist is paged; the patient just gets their
// usual gentle feedback (plus the safety-plan card on a low check-in, which
// is a kindness, not an alarm).
const repos = require('../data/repos');
const risk = require('./riskService');
const alerts = require('./alertService');
const { scanForRisk } = require('../utils/safety');
const { verifyScanVerdict } = require('../utils/tokens');

async function raiseJournalAlert(user, entry, detail) {
  return alerts.raiseAlert({
    patient: user,
    source: 'journal',
    detail: {
      ...detail,
      journalEntryId: entry.id,
      trigger: String(entry.note).slice(0, 200),
    },
  });
}

/**
 * Layer 2, fire-and-forget (also the worker's retry entry point).
 * Returns true when the scan concluded, false when it failed (dead-lettered).
 */
async function classifyJournalAsync({ entry, user }) {
  const note = String(entry.note || '').trim();
  if (!note) return true;
  try {
    const result = await risk.classify(note); // null when not configured
    if (!result) return true;
    if (result.risk === 'high') {
      const alert = await raiseJournalAlert(user, entry, { risk: 'high', classifier: result.reason });
      console.log(`[journal-screen] HIGH (${result.confidence.toFixed(2)}) entry=${entry.id} — alert ${alert.id}`);
    }
    return true;
  } catch (err) {
    console.error('[journal-screen] classify failed:', err.message);
    await repos
      .upsertJournalScanFailure({ journalEntryId: entry.id, error: err.message })
      .catch((e) => console.error('[journal-screen] dead-letter write failed:', e.message));
    return false;
  }
}

/**
 * Awaited by the check-in route: the keyword layer runs before the response
 * returns (a keyword crisis note is alerted synchronously with the save);
 * the LLM layer continues in the background.
 */
async function screenJournalEntry({ entry, user }) {
  const note = String(entry.note || '').trim();
  if (!note) return;
  if (scanForRisk(note)) {
    const alert = await raiseJournalAlert(user, entry, { risk: 'high', classifier: 'keyword' });
    console.log(`[journal-screen] keyword HIGH entry=${entry.id} — alert ${alert.id}`);
    return; // layer 1 alerted; layer 2 would be redundant
  }
  classifyJournalAsync({ entry, user }); // fire-and-forget
}

// --- encrypted entries (Phase 2.5) -------------------------------------------
// Once the note is ciphertext the server cannot scan what it stores, so the
// verdict has to travel WITH the entry. Both layers still run — they just run
// somewhere else:
//
//   layer 1 (keyword)  — on the device, before encryption, against the pattern
//                        list served by GET /api/safety/scan-patterns so the
//                        two implementations cannot drift.
//   layer 2 (LLM)      — POST /api/journal/scan, which classifies the text and
//                        DISCARDS it. Plaintext still passes through the server
//                        for that one call; it is never stored. The setup
//                        screen says so in those words, because the alternative
//                        is losing the stronger of the two layers, and Rule 1
//                        says a privacy feature may not widen the safety gap.
//
// The verdict is HMAC-signed by that endpoint (utils/tokens), so a modified
// client cannot assert "safe" — it can only omit the attestation, and an
// omission lands in the dead-letter table and in /api/health/safety.

const UNSCANNABLE = 'encrypted entry — no plaintext to re-scan';

/**
 * Awaited by the check-in route for a ciphertext entry.
 * `scan` is the client's attestation: { keyword, verdict, textHash, exp, sig,
 * patternsVersion }. Returns the attestation actually recorded.
 */
async function screenEncryptedEntry({ entry, user, scan }) {
  const signedOk = scan && verifyScanVerdict(scan, user.id);

  // No usable attestation. We do not know whether this entry was dangerous,
  // and saying nothing would make that indistinguishable from "it was fine".
  if (!signedOk) {
    const reason = !scan ? 'missing' : 'signature_invalid';
    const recorded = { status: 'unverified', reason, at: new Date().toISOString() };
    await repos.setJournalScan(entry.id, recorded);
    await repos
      .upsertJournalScanFailure({ journalEntryId: entry.id, error: `attestation ${reason}` })
      .catch((e) => console.error('[journal-screen] dead-letter write failed:', e.message));
    console.warn(`[journal-screen] encrypted entry=${entry.id} arrived with attestation ${reason} — dead-lettered`);
    return recorded;
  }

  const recorded = {
    status: 'verified',
    verdict: scan.verdict,
    keyword: !!scan.keyword,
    patternsVersion: scan.patternsVersion || null,
    at: new Date().toISOString(),
  };
  await repos.setJournalScan(entry.id, recorded);

  if (scan.verdict === 'high' || scan.keyword) {
    // The specialist is paged exactly as they are for a plaintext note. What
    // changes is HOW they read it: `crisisEnvelope` on the entry is the
    // excerpt sealed to their public key, so an alert about a patient in
    // danger still carries its text. When the patient has no specialist yet
    // there is no key to seal to, and the alert goes out without one.
    const alert = await alerts.raiseAlert({
      patient: user,
      source: 'journal',
      detail: {
        risk: 'high',
        journalEntryId: entry.id,
        encrypted: true,
        classifier: scan.keyword ? 'keyword-device' : 'llm',
        // No `trigger`: the server never held this text and is not about to
        // start. The envelope is the read path.
        crisisEnvelope: !!entry.crisisEnvelope,
      },
    });
    console.log(`[journal-screen] encrypted HIGH entry=${entry.id} — alert ${alert.id} (envelope: ${!!entry.crisisEnvelope})`);
  }
  return recorded;
}

/** True when a dead letter points at an entry that can never be re-scanned. */
const isUnscannable = (entry) => !!entry && !!entry.ciphertext;

module.exports = {
  screenJournalEntry, classifyJournalAsync, screenEncryptedEntry, isUnscannable, UNSCANNABLE,
};
