const express = require('express');
const repos = require('../data/repos');
const { userCard, publicUser } = require('../utils/serialize');
const { requireAuth, requireRole } = require('../middleware/auth');
const { CRISIS_RESOURCES } = require('../utils/safety');
const { onlineUserIds, emitToUser, emitToAdmins } = require('../realtime');

const router = express.Router();

// GET /api/safety/resources — public: shown before login too (onboarding).
router.get('/resources', (_req, res) => {
  res.json(CRISIS_RESOURCES);
});

router.use(requireAuth);

// GET /api/safety/alerts — alerts for the viewer. Specialist: own patients
// PLUS alerts they were paged for (on-call cover of unassigned patients —
// the escalation audit is the source of that visibility). Admin: all.
router.get('/alerts', async (req, res) => {
  let alerts;
  if (req.user.role === 'admin') {
    alerts = await repos.listSafetyAlerts();
  } else if (req.user.role === 'specialist') {
    alerts = await repos.listSafetyAlertsVisibleTo(req.user.id);
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

// GET /api/safety/alerts/critical — open alerts that reached tier 2 (60 min
// unacknowledged). Drives the admin banner that cannot be dismissed while
// any of these exist.
router.get('/alerts/critical', requireRole('admin'), async (_req, res) => {
  const alerts = await repos.listCriticalOpenAlerts();
  res.json({
    alerts: await Promise.all(
      alerts.map(async (a) => ({
        ...a,
        patient: userCard(await repos.findUserById(a.patientId), onlineUserIds),
      }))
    ),
  });
});

// POST /api/safety/alerts/:id/ack { actionTaken } — acknowledging is a
// CLINICAL act, not a UI dismissal: the acknowledging clinician records what
// they actually did (called the patient, escalated to emergency services...)
// and that text is stored in the append-only escalation audit. Allowed for
// admins, the treating specialist, and anyone the ladder paged (on-call).
router.post('/alerts/:id/ack', async (req, res) => {
  const alert = await repos.findSafetyAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'alert_not_found' });

  const allowed =
    req.user.role === 'admin' ||
    alert.specialistId === req.user.id ||
    (req.user.role === 'specialist' && (await repos.wasNotifiedForAlert(alert.id, req.user.id)));
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  if (alert.status === 'acknowledged') return res.status(409).json({ error: 'already_acknowledged' });

  const actionTaken = String((req.body || {}).actionTaken || '').trim();
  if (actionTaken.length < 5) {
    return res.status(400).json({ error: 'action_taken_required' });
  }

  const now = new Date().toISOString();
  const updated = await repos.updateSafetyAlert(alert.id, {
    status: 'acknowledged',
    acknowledgedBy: req.user.id,
    acknowledgedAt: now,
  });
  await repos.insertAlertEscalation({
    alertId: alert.id,
    tier: 0,
    notifiedId: req.user.id,
    method: 'ack',
    actionTaken: actionTaken.slice(0, 2000),
  });
  await repos.ackAlertEscalations(alert.id, now);

  // Live-close the alert everywhere (admin banner, specialist lists).
  emitToAdmins('safety:ack', { alert: updated });
  if (updated.specialistId && updated.specialistId !== req.user.id) {
    emitToUser(updated.specialistId, 'safety:ack', { alert: updated });
  }
  res.json({ alert: updated });
});

// --- on-call rota (admin) ----------------------------------------------------
// Who is paged for UNASSIGNED patients (tier 1 first, tier 2 as the 15-min
// backup). Without any current rota entry the ladder falls back to paging
// every admin — configure this before launch.

router.get('/rota', requireRole('admin'), async (_req, res) => {
  const entries = await repos.listOnCallRota();
  res.json({
    entries: await Promise.all(
      entries.map(async (e) => ({
        ...e,
        specialist: publicUser(await repos.findUserById(e.specialistId)),
      }))
    ),
  });
});

router.post('/rota', requireRole('admin'), async (req, res) => {
  const { specialistId, tier = 1, startsAt, endsAt } = req.body || {};
  const specialist = specialistId ? await repos.findUserById(specialistId) : null;
  if (!specialist || specialist.role !== 'specialist' || specialist.status !== 'approved') {
    return res.status(400).json({ error: 'specialist_invalid' });
  }
  if (![1, 2].includes(tier)) return res.status(400).json({ error: 'tier_invalid' });
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
    return res.status(400).json({ error: 'window_invalid' });
  }
  const entry = await repos.insertOnCallRota({
    specialistId, tier, startsAt: starts.toISOString(), endsAt: ends.toISOString(),
  });
  res.status(201).json({ entry });
});

router.delete('/rota/:id', requireRole('admin'), async (req, res) => {
  const deleted = await repos.deleteOnCallRota(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'rota_entry_not_found' });
  res.json({ deleted: true });
});

module.exports = router;
