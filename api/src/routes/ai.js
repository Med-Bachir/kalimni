// AI Support Companion endpoints (patients only). The heavy lifting — safety
// gate, RAG, generation, crisis handling — lives in companionService.
const express = require('express');
const repos = require('../data/repos');
const companion = require('../services/companionService');
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

// POST /api/ai/checkin { mood, stress, energy, sleep, note? } — daily check-in.
router.post('/checkin', validate(schemas.checkin), async (req, res) => {
  const { mood, stress, energy, sleep, note } = req.body;
  const entry = await repos.insertJournalEntry({
    userId: req.user.id, mood, stress, energy, sleep,
    note: note ? String(note).slice(0, 2000) : null,
  });
  // Safety net over the note (Phase 1.4): the keyword layer completes before
  // this response; the LLM layer continues in the background.
  await journalScreening.screenJournalEntry({ entry, user: req.user });
  // Post-insert total, so the client can celebrate a milestone in the same
  // response rather than waiting for the list to refetch.
  const { total } = await repos.journalEntryCountOf(req.user.id);
  res.status(201).json({ entry, total, feedback: companion.checkinFeedback(req.user, entry) });
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
