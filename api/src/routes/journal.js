// Encrypted journal (Phase 2.5) — the endpoints that make a locked journal
// possible without losing the safety net or the patient's own data.
//
// Four groups, and each exists for a reason worth stating:
//
//   /scan       — the LLM safety layer, kept alive under encryption. Classifies
//                 text and STORES NOTHING, returning a signed verdict the
//                 client attaches to the entry it is about to encrypt.
//   /recovery   — the escrow choice. Designed before any crypto was written,
//                 because losing a phone must not silently destroy a year of
//                 journalling.
//   /keys       — the specialist's published X25519 public key, so a patient
//                 can seal one entry to one clinician.
//   /entries/:id/share — per-entry sharing. Never a blanket toggle.
const express = require('express');
const repos = require('../data/repos');
const risk = require('../services/riskService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const rateLimits = require('../middleware/rateLimits');
const schemas = require('../schemas');
const { scanForRisk, RISK_PATTERNS, PATTERNS_VERSION } = require('../utils/safety');
const { signScanVerdict, hashText } = require('../utils/tokens');

const router = express.Router();
router.use(requireAuth);

// GET /api/journal/scan-patterns — the keyword layer's word list, so the
// on-device scan and the server scan cannot drift apart. Not a secret: it is
// a list of crisis phrases, and shipping it to the device is the only way the
// device can run layer 1 before encrypting. Versioned, so an entry's
// attestation records which list judged it.
router.get('/scan-patterns', (_req, res) => {
  res.json({ version: PATTERNS_VERSION, patterns: RISK_PATTERNS });
});

// POST /api/journal/scan { text } — layer 2 under encryption.
//
// The plaintext passes through here ONCE and is never written down: no row,
// no log line, no field on the response. What comes back is a signed verdict.
// This is the honest trade at the centre of 2.5 — encryption removes the
// server's ability to scan what it stores, and the alternative to this call
// is losing the stronger of the two safety layers entirely, which Rule 1
// forbids. The setup screen tells the patient in plain language that this
// happens.
router.post('/scan', requireRole('patient'), rateLimits.aiChat, validate(schemas.journalScan), async (req, res) => {
  const text = String(req.body.text || '').trim();
  const textHash = hashText(text);
  const keyword = scanForRisk(text);

  let verdict = keyword ? 'high' : 'none';
  let classified = false;
  try {
    const result = await risk.classify(text); // null when no LLM configured
    if (result) {
      classified = true;
      if (result.risk === 'high') verdict = 'high';
    }
  } catch (err) {
    // Fail closed in the same direction as everywhere else: an unreachable
    // classifier does not become a quiet "safe".
    console.error('[journal] scan classify failed:', err.message);
  }

  res.json({
    token: signScanVerdict({ verdict, textHash, userId: req.user.id }),
    keyword,
    // The client shows the crisis card immediately on a high verdict rather
    // than waiting for a specialist to call — same as the plaintext path.
    verdict,
    llmLayer: classified,
  });
});

// --- recovery -----------------------------------------------------------------

// GET /api/journal/recovery — what this account chose, and the wrapped key if
// there is one. `wrappedKey` is opaque to us for method 'phrase' (only the
// patient's phrase opens it) and openable by the operator for 'escrow', which
// is exactly what the setup screen warns about.
router.get('/recovery', requireRole('patient'), async (req, res) => {
  const row = await repos.getJournalRecovery(req.user.id);
  res.json({
    recovery: row
      ? { method: row.method, keyVersion: row.keyVersion, wrappedKey: row.wrappedKey, publicKey: row.publicKey }
      : null,
  });
});

// PUT /api/journal/recovery { method, wrappedKey?, keyVersion?, publicKey? }
// Turning the lock on, or changing how it can be reopened. No default method:
// the client must send one, chosen by the patient on a screen that explains
// what each costs.
router.put('/recovery', requireRole('patient'), validate(schemas.journalRecovery), async (req, res) => {
  const { method, wrappedKey, keyVersion, publicKey } = req.body;
  if (method !== 'none' && !wrappedKey) {
    return res.status(400).json({ error: 'wrapped_key_required' });
  }
  const row = await repos.upsertJournalRecovery(req.user.id, { method, wrappedKey, keyVersion, publicKey });
  res.json({ recovery: { method: row.method, keyVersion: row.keyVersion } });
});

// --- public keys ----------------------------------------------------------------

// PUT /api/journal/keys { publicKey } — a specialist publishes the public half
// of their sharing keypair. The private half stays in their device's secure
// store; the server never sees it and cannot open a shared entry.
router.put('/keys', requireRole('specialist'), validate(schemas.publicKey), async (req, res) => {
  const updated = await repos.setUserPublicKey(req.user.id, req.body.publicKey);
  res.json({ publicKey: updated.publicKey });
});

// GET /api/journal/keys/specialist — the treating specialist's public key, so
// the patient's device can seal an entry (or a crisis excerpt) to them.
// Returns null when they have not published one yet, which the client treats
// as "sharing is not available", never as "share in the clear".
router.get('/keys/specialist', requireRole('patient'), async (req, res) => {
  if (!req.user.assignedSpecialistId) return res.json({ specialistId: null, publicKey: null });
  const specialist = await repos.findUserById(req.user.assignedSpecialistId);
  res.json({ specialistId: specialist?.id || null, publicKey: specialist?.publicKey || null });
});

// --- per-entry sharing ------------------------------------------------------------

// POST /api/journal/entries/:id/share { envelope } — the patient re-encrypts
// ONE entry to their specialist's public key. Per entry, per specialist, every
// time an explicit act.
router.post('/entries/:id/share', requireRole('patient'), validate(schemas.journalShare), async (req, res) => {
  const entry = await repos.findJournalEntry(req.params.id);
  if (!entry || entry.userId !== req.user.id) return res.status(404).json({ error: 'entry_not_found' });
  if (!req.user.assignedSpecialistId) return res.status(409).json({ error: 'no_specialist' });

  const share = await repos.insertJournalShare({
    entryId: entry.id,
    patientId: req.user.id,
    specialistId: req.user.assignedSpecialistId,
    envelope: req.body.envelope,
  });
  res.status(201).json({ share: { id: share.id, entryId: share.entryId, createdAt: share.createdAt } });
});

// DELETE /api/journal/entries/:id/share — stop sharing. Honest about what this
// can and cannot do: the envelope is deleted, so the entry can no longer be
// opened, but anything the specialist already read they have already read.
// The client says that rather than implying the memory can be recalled.
router.delete('/entries/:id/share', requireRole('patient'), async (req, res) => {
  if (!req.user.assignedSpecialistId) return res.status(409).json({ error: 'no_specialist' });
  await repos.deleteJournalShare(req.params.id, req.user.id, req.user.assignedSpecialistId);
  res.json({ deleted: true });
});

// GET /api/journal/shares — which of the patient's own entries are currently
// shared, so the journal list can mark them.
router.get('/shares', requireRole('patient'), async (req, res) => {
  const shares = await repos.journalSharesOfPatient(req.user.id);
  res.json({ entryIds: shares.map((s) => s.entryId) });
});

module.exports = router;
