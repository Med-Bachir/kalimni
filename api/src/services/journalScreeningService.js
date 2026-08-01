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

module.exports = { screenJournalEntry, classifyJournalAsync };
