// Session Witness — the patient's side (Phase 2.3). Patients only: the
// specialist reads shared briefs through /api/specialist, which is behind
// requireApprovedSpecialist and the assignment check.
//
// Every route here operates on `req.user`'s own brief. There is deliberately
// no brief id in the draft endpoints — one open draft per patient (the
// partial unique index in migration 006), so there is nothing to address and
// nothing to guess.
const express = require('express');
const repos = require('../data/repos');
const witness = require('../services/witnessService');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../schemas');

const router = express.Router();
router.use(requireAuth, requireRole('patient'));

// GET /api/witness/draft?appointmentId= — the brief as it stands right now.
// Generated bodies are recomputed on every read, so what the patient reviews
// is what gets sent; their notes and ticks survive.
router.get('/draft', async (req, res) => {
  const result = await witness.draftFor(req.user, { appointmentId: req.query.appointmentId });
  if (result.reason === 'no_specialist') {
    return res.status(409).json({ error: 'no_specialist' });
  }
  res.json({ brief: result.brief, windowDays: witness.WINDOW_DAYS, maxNotes: witness.MAX_NOTES });
});

// PUT /api/witness/draft { notes?, includedIds? } — save typing and ticks.
// Not the send button: nothing leaves the patient until POST /share.
router.put('/draft', validate(schemas.briefDraft), async (req, res) => {
  const brief = await witness.saveDraft(req.user, req.body);
  if (!brief) return res.status(404).json({ error: 'no_draft' });
  res.json({ brief });
});

// POST /api/witness/draft/share — the send button. Unticked items are deleted
// from the row here, not merely hidden.
router.post('/draft/share', async (req, res) => {
  const result = await witness.share(req.user);
  if (result.error) return res.status(result.error === 'no_draft' ? 404 : 400).json({ error: result.error });
  res.json({ brief: result.brief });
});

// DELETE /api/witness/draft — "not this time". A brief nobody has read yet
// leaves no trace.
router.delete('/draft', async (req, res) => {
  const deleted = await witness.discardDraft(req.user);
  if (!deleted) return res.status(404).json({ error: 'no_draft' });
  res.json({ deleted: true });
});

// GET /api/witness/briefs — the patient's own record of what they sent, and
// what they took away from each session.
router.get('/briefs', async (req, res) => {
  res.json({ briefs: await repos.sessionBriefsOf(req.user.id, 20) });
});

// POST /api/witness/briefs/:id/takeaway { text } — the after-session line.
router.post('/briefs/:id/takeaway', validate(schemas.briefTakeaway), async (req, res) => {
  const brief = await witness.setTakeaway(req.user, req.params.id, req.body.text);
  if (!brief) return res.status(404).json({ error: 'brief_not_found' });
  res.json({ brief });
});

module.exports = router;
