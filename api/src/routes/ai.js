// AI Support Companion endpoints (patients only). The heavy lifting — safety
// gate, RAG, generation, crisis handling — lives in companionService.
const express = require('express');
const repos = require('../data/repos');
const companion = require('../services/companionService');
const recommendations = require('../services/recommendationService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { CRISIS_RESOURCES } = require('../utils/safety');

const router = express.Router();
router.use(requireAuth, requireRole('patient'));

// Specialists can switch the companion off per patient (users.settings jsonb).
const aiEnabled = (user) => user.settings?.aiCompanion !== false;

// Tiny in-memory rate limit: LIMIT chat messages per WINDOW per user. Enough
// against runaway clients/scripts on a single-node deployment; swap for a
// store-backed limiter if the API is ever load-balanced.
const WINDOW_MS = 5 * 60_000;
const LIMIT = 20;
const hits = new Map(); // userId -> number[] (timestamps)
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.user.id) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    return res.status(429).json({ error: 'ai_rate_limited' });
  }
  list.push(now);
  hits.set(req.user.id, list);
  next();
}

// POST /api/ai/chat { text }
router.post('/chat', rateLimit, async (req, res) => {
  if (!aiEnabled(req.user)) return res.status(403).json({ error: 'ai_disabled' });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });

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
router.post('/checkin', async (req, res) => {
  const { mood, stress, energy, sleep, note } = req.body || {};
  const valid = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
  if (![mood, stress, energy, sleep].every(valid)) {
    return res.status(400).json({ error: 'checkin_values_invalid' });
  }
  const entry = await repos.insertJournalEntry({
    userId: req.user.id, mood, stress, energy, sleep,
    note: note ? String(note).slice(0, 2000) : null,
  });
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
