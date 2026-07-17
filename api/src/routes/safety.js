const express = require('express');
const repos = require('../data/repos');
const { userCard } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { CRISIS_RESOURCES } = require('../utils/safety');
const { onlineUserIds } = require('../realtime');

const router = express.Router();

// GET /api/safety/resources — public: shown before login too (onboarding).
router.get('/resources', (_req, res) => {
  res.json(CRISIS_RESOURCES);
});

router.use(requireAuth);

// GET /api/safety/alerts — open alerts for the viewer (specialist: own
// patients; admin: all).
router.get('/alerts', async (req, res) => {
  let alerts;
  if (req.user.role === 'admin') {
    alerts = await repos.listSafetyAlerts();
  } else if (req.user.role === 'specialist') {
    alerts = await repos.listSafetyAlerts(req.user.id);
  } else {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json({
    alerts: await Promise.all(
      alerts.map(async (a) => ({
        ...a,
        patient: userCard(await repos.findUserById(a.patientId), onlineUserIds),
        message: a.messageId ? await repos.findMessage(a.messageId) : null,
      }))
    ),
  });
});

// POST /api/safety/alerts/:id/ack — specialist confirms they handled it.
router.post('/alerts/:id/ack', async (req, res) => {
  const alert = await repos.findSafetyAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'alert_not_found' });
  const allowed = req.user.role === 'admin' || alert.specialistId === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  const updated = await repos.updateSafetyAlert(alert.id, {
    status: 'acknowledged',
    acknowledgedBy: req.user.id,
    acknowledgedAt: new Date().toISOString(),
  });
  res.json({ alert: updated });
});

module.exports = router;
