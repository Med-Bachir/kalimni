const express = require('express');
const repos = require('../data/repos');
const { publicUser, userCard } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { onlineUserIds, emitToAdmins } = require('../realtime');
const { deleteVoiceFile } = require('../utils/mediaStore');

const router = express.Router();
router.use(requireAuth);

// PUT /api/users/me { name?, language?, settings? }
router.put('/me', async (req, res) => {
  const { name, language, settings } = req.body || {};
  const patch = {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'name_required' });
    patch.name = String(name).trim();
  }
  if (language !== undefined) {
    if (!['ar', 'fr'].includes(language)) return res.status(400).json({ error: 'language_invalid' });
    patch.language = language;
  }
  if (settings !== undefined && typeof settings === 'object') {
    patch.settings = { ...req.user.settings, ...settings };
  }
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
// for push notifications. Upserts, so re-registering is harmless.
router.post('/me/push-token', async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token_required' });
  await repos.savePushToken(req.user.id, token, platform ? String(platform) : null);
  res.json({ ok: true });
});

// DELETE /api/users/me/push-token { token } — called on logout so the device
// stops receiving another account's notifications.
router.delete('/me/push-token', async (req, res) => {
  const { token } = req.body || {};
  if (token) await repos.deletePushToken(String(token));
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
