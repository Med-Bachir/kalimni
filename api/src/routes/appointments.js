const express = require('express');
const repos = require('../data/repos');
const { requireAuth } = require('../middleware/auth');
const { emitToUser } = require('../realtime');
const chat = require('../services/chatService');

const router = express.Router();
router.use(requireAuth);

const MAX_HORIZON_MS = 120 * 24 * 60 * 60 * 1000; // proposals capped 120 days out

// GET /api/appointments?scope=upcoming | ?conversationId=
router.get('/', async (req, res) => {
  const { scope, conversationId } = req.query;
  if (conversationId) {
    const conv = await repos.findConversation(conversationId);
    if (!conv || !chat.isMember(conv, req.user.id)) {
      return res.status(404).json({ error: 'conversation_not_found' });
    }
    return res.json({ appointments: await repos.appointmentsOfConversation(conversationId) });
  }
  if (scope === 'upcoming' || !scope) {
    return res.json({ appointments: await repos.upcomingAppointmentsOf(req.user.id) });
  }
  return res.status(400).json({ error: 'scope_invalid' });
});

// POST /api/appointments { conversationId, scheduledAt, durationMin?, mode?, note? }
// Either participant proposes; the other confirms. Only one open slot per
// conversation at a time.
router.post('/', async (req, res) => {
  const { conversationId, scheduledAt, durationMin, mode, note } = req.body || {};
  const conv = await repos.findConversation(conversationId);
  if (!conv || !chat.isMember(conv, req.user.id)) {
    return res.status(404).json({ error: 'conversation_not_found' });
  }
  if (req.user.role === 'specialist' && req.user.status !== 'approved') {
    return res.status(403).json({ error: 'specialist_not_approved' });
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'scheduled_at_invalid' });
  if (when.getTime() < Date.now()) return res.status(400).json({ error: 'scheduled_at_past' });
  if (when.getTime() > Date.now() + MAX_HORIZON_MS) return res.status(400).json({ error: 'scheduled_at_too_far' });
  if (mode && !['call', 'chat'].includes(mode)) return res.status(400).json({ error: 'mode_invalid' });
  if (durationMin !== undefined && (!Number.isInteger(durationMin) || durationMin < 10 || durationMin > 180)) {
    return res.status(400).json({ error: 'duration_invalid' });
  }
  if (await repos.hasOpenAppointment(conversationId)) {
    return res.status(409).json({ error: 'appointment_exists' });
  }

  const appointment = await repos.insertAppointment({
    conversationId,
    patientId: conv.patientId,
    specialistId: conv.specialistId,
    proposedBy: req.user.id,
    scheduledAt: when.toISOString(),
    durationMin: durationMin || 45,
    mode: mode || 'call',
    note: note ? String(note).slice(0, 500) : null,
  });

  emitToUser(chat.partnerOf(conv, req.user.id), 'appointment:new', { appointment });
  res.status(201).json({ appointment });
});

// POST /api/appointments/:id/respond { action: 'confirm' | 'decline' }
// Only the invitee (the party who did NOT propose) may respond, while proposed.
router.post('/:id/respond', async (req, res) => {
  const appointment = await repos.findAppointment(req.params.id);
  if (!appointment) return res.status(404).json({ error: 'appointment_not_found' });
  const isMember = appointment.patientId === req.user.id || appointment.specialistId === req.user.id;
  if (!isMember) return res.status(403).json({ error: 'forbidden' });
  if (appointment.proposedBy === req.user.id) return res.status(403).json({ error: 'proposer_cannot_respond' });
  if (appointment.status !== 'proposed') return res.status(409).json({ error: 'not_proposed' });

  const { action } = req.body || {};
  if (!['confirm', 'decline'].includes(action)) return res.status(400).json({ error: 'action_invalid' });

  const updated = await repos.updateAppointment(appointment.id, {
    status: action === 'confirm' ? 'confirmed' : 'declined',
    decidedAt: new Date().toISOString(),
  });
  emitToUser(appointment.proposedBy, 'appointment:update', { appointment: updated });
  res.json({ appointment: updated });
});

// POST /api/appointments/:id/cancel — either party, while proposed or confirmed.
router.post('/:id/cancel', async (req, res) => {
  const appointment = await repos.findAppointment(req.params.id);
  if (!appointment) return res.status(404).json({ error: 'appointment_not_found' });
  const isMember = appointment.patientId === req.user.id || appointment.specialistId === req.user.id;
  if (!isMember) return res.status(403).json({ error: 'forbidden' });
  if (!['proposed', 'confirmed'].includes(appointment.status)) {
    return res.status(409).json({ error: 'not_cancellable' });
  }

  const updated = await repos.updateAppointment(appointment.id, {
    status: 'cancelled', decidedAt: new Date().toISOString(),
  });
  const otherId = req.user.id === appointment.patientId ? appointment.specialistId : appointment.patientId;
  emitToUser(otherId, 'appointment:update', { appointment: updated });
  res.json({ appointment: updated });
});

module.exports = router;
