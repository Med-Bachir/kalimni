const express = require('express');
const repos = require('../data/repos');
const { publicUser, userCard } = require('../utils/serialize');
const { requireAuth, requireRole } = require('../middleware/auth');
const { emitToUser, onlineUserIds } = require('../realtime');
const chat = require('../services/chatService');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// GET /api/admin/stats — dashboard tiles.
router.get('/stats', async (_req, res) => {
  res.json(await repos.adminStats());
});

// GET /api/admin/users?role=
router.get('/users', async (req, res) => {
  const users = await repos.listUsers(req.query.role || undefined);
  res.json({ users: users.map(publicUser) });
});

// GET /api/admin/specialists/pending — approval queue.
router.get('/specialists/pending', async (_req, res) => {
  res.json({ specialists: (await repos.listPendingSpecialists()).map(publicUser) });
});

// POST /api/admin/specialists/:id/approve | /reject
router.post('/specialists/:id/:action', async (req, res) => {
  if (!['approve', 'reject'].includes(req.params.action)) {
    return res.status(400).json({ error: 'action_invalid' });
  }
  const specialist = await repos.findUserById(req.params.id);
  if (!specialist || specialist.role !== 'specialist') {
    return res.status(404).json({ error: 'specialist_not_found' });
  }
  const updated = await repos.updateUser(specialist.id, {
    status: req.params.action === 'approve' ? 'approved' : 'rejected',
  });
  emitToUser(updated.id, 'account:status', { status: updated.status });
  res.json({ specialist: publicUser(updated) });
});

// GET /api/admin/patients/unassigned — patients with no specialist yet, with
// their latest questionnaire result so the admin can match appropriately.
router.get('/patients/unassigned', async (_req, res) => {
  const patients = await repos.listUnassignedPatients();
  const items = await Promise.all(
    patients.map(async (p) => ({
      ...publicUser(p),
      latestResult: await repos.latestResultOf(p.id),
    }))
  );
  res.json({ patients: items });
});

// POST /api/admin/patients/:id/assign { specialistId } — direct assignment
// (no matching request needed). Closes the patient's open request if any.
router.post('/patients/:id/assign', async (req, res) => {
  const patient = await repos.findUserById(req.params.id);
  if (!patient || patient.role !== 'patient') {
    return res.status(404).json({ error: 'patient_not_found' });
  }
  const specialist = req.body?.specialistId ? await repos.findUserById(req.body.specialistId) : null;
  if (!specialist || specialist.role !== 'specialist' || specialist.status !== 'approved') {
    return res.status(400).json({ error: 'specialist_invalid' });
  }

  const updated = await repos.updateUser(patient.id, { assignedSpecialistId: specialist.id });
  await chat.getOrCreateConversation(patient.id, specialist.id);

  const open = await repos.openMatchingRequestOf(patient.id);
  if (open) {
    const request = await repos.updateMatchingRequest(open.id, {
      status: 'accepted', assignedSpecialistId: specialist.id,
      decidedAt: new Date().toISOString(),
    });
    emitToUser(patient.id, 'matching:update', { request: await serializeRequest(request) });
  }
  emitToUser(specialist.id, 'patients:update', { patientId: patient.id });

  res.json({ patient: publicUser(updated), specialist: userCard(specialist, onlineUserIds) });
});

// --- Matching workflow -------------------------------------------------------
const serializeRequest = async (r) => {
  const [patient, requested, assigned] = await Promise.all([
    repos.findUserById(r.patientId),
    r.requestedSpecialistId ? repos.findUserById(r.requestedSpecialistId) : null,
    r.assignedSpecialistId ? repos.findUserById(r.assignedSpecialistId) : null,
  ]);
  return {
    ...r,
    patient: userCard(patient, onlineUserIds),
    requestedSpecialist: requested ? userCard(requested, onlineUserIds) : null,
    assignedSpecialist: assigned ? userCard(assigned, onlineUserIds) : null,
  };
};

// GET /api/admin/requests?status=
router.get('/requests', async (req, res) => {
  const requests = await repos.listMatchingRequests(req.query.status || undefined);
  res.json({ requests: await Promise.all(requests.map(serializeRequest)) });
});

// POST /api/admin/requests/:id { action: 'assign'|'review'|'reject', specialistId? }
router.post('/requests/:id', async (req, res) => {
  let request = await repos.findMatchingRequest(req.params.id);
  if (!request) return res.status(404).json({ error: 'request_not_found' });
  const { action, specialistId } = req.body || {};

  if (action === 'review') {
    request = await repos.updateMatchingRequest(request.id, { status: 'review' });
  } else if (action === 'reject') {
    request = await repos.updateMatchingRequest(request.id, {
      status: 'rejected', decidedAt: new Date().toISOString(),
    });
  } else if (action === 'assign') {
    const specialist = specialistId ? await repos.findUserById(specialistId) : null;
    if (!specialist || specialist.role !== 'specialist' || specialist.status !== 'approved') {
      return res.status(400).json({ error: 'specialist_invalid' });
    }
    const patient = await repos.findUserById(request.patientId);
    if (!patient) return res.status(404).json({ error: 'patient_not_found' });

    await repos.updateUser(patient.id, { assignedSpecialistId: specialist.id });
    request = await repos.updateMatchingRequest(request.id, {
      status: 'accepted', assignedSpecialistId: specialist.id,
      decidedAt: new Date().toISOString(),
    });
    await chat.getOrCreateConversation(patient.id, specialist.id);

    emitToUser(patient.id, 'matching:update', { request: await serializeRequest(request) });
    emitToUser(specialist.id, 'patients:update', { patientId: patient.id });
  } else {
    return res.status(400).json({ error: 'action_invalid' });
  }

  res.json({ request: await serializeRequest(request) });
});

module.exports = router;
