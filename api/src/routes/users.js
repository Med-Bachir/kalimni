const express = require('express');
const repos = require('../data/repos');
const { publicUser, userCard } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../schemas');
const { onlineUserIds, emitToAdmins } = require('../realtime');
const { deleteVoiceFile } = require('../utils/mediaStore');

const router = express.Router();
router.use(requireAuth);

// PUT /api/users/me { name?, language?, settings? }
// The settings schema is a WHITELIST (currently `notifications` only): the
// old spread merged any key the client sent, so a patient could post
// { settings: { aiCompanion: true } } and re-enable a companion their
// specialist had switched off (Phase 3.2).
router.put('/me', validate(schemas.updateMe), async (req, res) => {
  const { name, language, settings } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (language !== undefined) patch.language = language;
  if (settings !== undefined) patch.settings = { ...req.user.settings, ...settings };
  const user = await repos.updateUser(req.user.id, patch);
  res.json({ user: publicUser(user) });
});

// GET /api/users/me/specialist — the patient's assigned specialist card.
router.get('/me/specialist', async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ error: 'forbidden' });
  const specialist = req.user.assignedSpecialistId
    ? await repos.findUserById(req.user.assignedSpecialistId)
    : null;
  res.json({ specialist: specialist ? userCard(specialist, onlineUserIds) : null });
});

// POST /api/users/me/push-token { token, platform? } — register this device
// for push notifications. Upserts, so re-registering is harmless. 409 when the
// token is still bound to another account (its owner must log out first —
// see savePushToken for why re-parenting is refused).
router.post('/me/push-token', validate(schemas.pushToken), async (req, res) => {
  const { token, platform } = req.body;
  const saved = await repos.savePushToken(req.user.id, token, platform ? String(platform) : null);
  if (!saved) return res.status(409).json({ error: 'token_owned_by_other_account' });
  res.json({ ok: true });
});

// DELETE /api/users/me/push-token { token } — called on logout so the device
// stops receiving this account's notifications. Owner-scoped: a token string
// in someone else's hands must not be able to silence another user's alerts.
router.delete('/me/push-token', async (req, res) => {
  const { token } = req.body || {};
  if (token) await repos.deletePushTokenOwned(req.user.id, String(token));
  res.json({ ok: true });
});

// DELETE /api/users/me — account deletion (privacy requirement).
// Messages are anonymized rather than deleted so the specialist's clinical
// record stays coherent; all personal data is removed. Atomic in Postgres.
router.delete('/me', async (req, res) => {
  // Collect voice-note files BEFORE the cascade anonymizes sender_id.
  const audioUrls = await repos.audioUrlsOfSender(req.user.id);
  await repos.deleteUserCascade(req.user.id);
  audioUrls.forEach(deleteVoiceFile); // best-effort disk cleanup
  emitToAdmins('users:update', { userId: req.user.id, deleted: true });
  res.json({ deleted: true });
});

module.exports = router;
