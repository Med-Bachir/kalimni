// AI Support Companion endpoints (patients only). The heavy lifting — safety
// gate, RAG, generation, crisis handling — lives in companionService.
const express = require('express');
const repos = require('../data/repos');
const companion = require('../services/companionService');
const memory = require('../services/memoryService');
const journalScreening = require('../services/journalScreeningService');
const recommendations = require('../services/recommendationService');
const { requireAuth, requireRole } = require('../middleware/auth');
const rateLimits = require('../middleware/rateLimits');
const { validate } = require('../middleware/validate');
const schemas = require('../schemas');
const { CRISIS_RESOURCES } = require('../utils/safety');

const router = express.Router();
router.use(requireAuth, requireRole('patient'));

// Specialists can switch the companion off per patient (users.settings jsonb).
const aiEnabled = (user) => user.settings?.aiCompanion !== false;

// POST /api/ai/chat { text } — rate limited per user (20 / 5 min); the old
// hand-rolled Map limiter grew unbounded per process.
router.post('/chat', rateLimits.aiChat, validate(schemas.aiChat), async (req, res) => {
  if (!aiEnabled(req.user)) return res.status(403).json({ error: 'ai_disabled' });
  const { text } = req.body;

  try {
    res.json(await companion.handleMessage(req.user, text));
  } catch (err) {
    // Nothing was stored (companionService stores only after success): the
    // client keeps the draft and offers retry.
    console.error('[ai] chat failed:', err.message);
    res.status(503).json({ error: 'ai_unavailable' });
  }
});

// GET /api/ai/history — thread + state + crisis resources (for the banner).
router.get('/history', async (req, res) => {
  const conversation = await repos.getOrCreateAiConversation(req.user.id);
  const [messages, state, openHold] = await Promise.all([
    repos.aiMessagesOf(conversation.id, 100),
    repos.getAiState(conversation.id),
    repos.hasOpenAiHoldAlert(req.user.id),
  ]);
  res.json({
    // The hold is derived from the open HOLD-alert, not the row
    // (companionService): report it the same way so a recreated thread still
    // shows the banner. Cleared-keyword alerts don't pause the companion.
    conversation: openHold ? { ...conversation, status: 'crisis_hold' } : conversation,
    messages,
    state: state ? { emotion: state.emotion, topics: state.topics } : null,
    aiEnabled: aiEnabled(req.user),
    resources: CRISIS_RESOURCES,
  });
});

// DELETE /api/ai/history — privacy: patient wipes their AI thread entirely.
// Refused while a crisis HOLD is open: recreating the thread must never
// clear the hold, and the thread is the specialist's context for the
// intervention they have not yet made. (A cleared-keyword alert without a
// hold does not block the patient's right to wipe.)
router.delete('/history', async (req, res) => {
  if (await repos.hasOpenAiHoldAlert(req.user.id)) {
    return res.status(409).json({ error: 'crisis_hold_active', resources: CRISIS_RESOURCES });
  }
  await repos.deleteAiThread(req.user.id);
  res.json({ deleted: true });
});

// --- what your companion remembers (Phase 2.4) --------------------------------
// `ai_state.summary` is an LLM-authored précis about a psychiatric patient,
// rebuilt every 8 exchanges from their own transcript. These four endpoints
// make it theirs: readable, correctable, forgettable line by line.
//
// None of them is gated on `aiEnabled`. A patient whose specialist switched
// the companion off must still be able to read and delete what was written
// about them — arguably then most of all.
//
// None of them is gated on the crisis hold either, unlike DELETE /history.
// That refusal exists because wiping the thread destroys the specialist's
// context for an intervention they have not yet made; the summary is derived
// text that no specialist reads, and the alert, its trigger excerpt and every
// ai_message survive untouched. Refusing here would cost a patient in crisis
// their right to their own record and protect nothing.

// GET /api/ai/memory — the memory split into editable lines.
router.get('/memory', async (req, res) => {
  res.json(await memory.memoryFor(req.user));
});

// PUT /api/ai/memory { text } — the patient rewrites it in their own words.
// Takes effect on the very next turn: companionService reads this same row.
router.put('/memory', validate(schemas.memoryUpdate), async (req, res) => {
  const result = await memory.replaceMemory(req.user, req.body.text);
  if (!result) return res.status(404).json({ error: 'no_companion_thread' });
  res.json(result);
});

// DELETE /api/ai/memory/lines/:lineId — one-tap forget. The line goes AND is
// remembered as forgotten, so the next refresh cannot re-derive it.
router.delete('/memory/lines/:lineId', async (req, res) => {
  const result = await memory.forgetLine(req.user, req.params.lineId);
  if (!result) return res.status(404).json({ error: 'no_companion_thread' });
  if (result.notFound) return res.status(404).json({ error: 'line_not_found' });
  res.json(result);
});

// DELETE /api/ai/memory — forget all of it. The thread itself is untouched;
// DELETE /api/ai/history is the bigger hammer and keeps its own guard.
router.delete('/memory', async (req, res) => {
  const result = await memory.forgetAll(req.user);
  if (!result) return res.status(404).json({ error: 'no_companion_thread' });
  res.json(result);
});

// POST /api/ai/checkin — daily check-in. The written note arrives one of two
// ways (Phase 2.5):
//   { note }                                  plaintext, the original path
//   { ciphertext, nonce, keyVersion, scan }   locked; the server cannot read it
// The sliders are never encrypted: they are the trend the clinician treats
// from, they carry no free text, and locking them would cost the whole
// measurement layer for no privacy gain.
router.post('/checkin', validate(schemas.checkin), async (req, res) => {
  const { mood, stress, energy, sleep, note, ciphertext, nonce, keyVersion, encAlg, scan, crisisEnvelope } = req.body;
  const encrypted = !!ciphertext;

  const entry = await repos.insertJournalEntry({
    userId: req.user.id, mood, stress, energy, sleep,
    note: encrypted || !note ? null : String(note).slice(0, 2000),
    ciphertext: encrypted ? ciphertext : null,
    nonce: encrypted ? nonce : null,
    keyVersion: encrypted ? keyVersion || 1 : null,
    encAlg: encrypted ? encAlg || 'nacl.secretbox' : null,
    crisisEnvelope: encrypted && crisisEnvelope ? crisisEnvelope : undefined,
  });

  // Safety net over the note. Plaintext (Phase 1.4): the keyword layer
  // completes before this response, the LLM layer continues in the
  // background. Ciphertext (Phase 2.5): both layers already ran on the
  // device / through /api/journal/scan, and what is checked here is that a
  // valid, signed attestation actually arrived — a missing one is
  // dead-lettered rather than assumed harmless.
  let recordedScan = null;
  if (encrypted) {
    // The attestation is written to the row by the screener, so it has to be
    // merged into the response too — otherwise the client is told `scan: null`
    // for an entry that was in fact verified, which is exactly backwards from
    // what the field means everywhere else.
    recordedScan = await journalScreening.screenEncryptedEntry({ entry, user: req.user, scan });
  } else {
    await journalScreening.screenJournalEntry({ entry, user: req.user });
  }
  // Post-insert total, so the client can celebrate a milestone in the same
  // response rather than waiting for the list to refetch.
  const { total } = await repos.journalEntryCountOf(req.user.id);
  res.status(201).json({
    entry: recordedScan ? { ...entry, scan: recordedScan } : entry,
    total,
    feedback: companion.checkinFeedback(req.user, entry),
  });
});

// GET /api/ai/followup — the open-loop question shown on the home screen.
// All the gating lives in companionService.followUpFor (see the safety notes
// there); null simply means "say nothing today".
router.get('/followup', async (req, res) => {
  res.json({ followUp: await companion.followUpFor(req.user) });
});

// GET /api/ai/recommendations — content picked for THIS patient's case
// (questionnaire results + recent check-ins + companion emotion state).
router.get('/recommendations', async (req, res) => {
  res.json(await recommendations.recommendFor(req.user));
});

// GET /api/ai/checkins — the patient's own recent entries. 60 rather than 30:
// the trend charts compare two 14-day windows, and nothing stops a patient
// logging twice in a day, so a count-based limit needs the headroom.
router.get('/checkins', async (req, res) => {
  const [entries, { total }] = await Promise.all([
    repos.journalEntriesOf(req.user.id, 60),
    repos.journalEntryCountOf(req.user.id),
  ]);
  res.json({ entries, total });
});

module.exports = router;
