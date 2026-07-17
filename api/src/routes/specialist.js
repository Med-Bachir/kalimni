const express = require('express');
const repos = require('../data/repos');
const { userCard } = require('../utils/serialize');
const { requireAuth, requireApprovedSpecialist } = require('../middleware/auth');
const { onlineUserIds } = require('../realtime');

const router = express.Router();
router.use(requireAuth, requireApprovedSpecialist);

const NEW_CASE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

// GET /api/specialist/patients — assigned patients with chat + intake context.
router.get('/patients', async (req, res) => {
  const assigned = await repos.listPatientsOf(req.user.id);

  const patients = await Promise.all(
    assigned.map(async (p) => {
      const [conv, latestResult, assignedRequest, openAlerts] = await Promise.all([
        repos.findConversationBetween(p.id, req.user.id),
        repos.latestResultOf(p.id),
        repos.latestAcceptedRequestOf(p.id),
        repos.countOpenAlertsOf(p.id),
      ]);
      const [lastMessage, unreadCount, nextAppointment] = conv
        ? await Promise.all([
            repos.lastMessageOf(conv.id),
            repos.unreadCountFor(conv.id, req.user.id),
            repos.nextAppointmentForConversation(conv.id),
          ])
        : [null, 0, null];
      const assignedAt = assignedRequest?.decidedAt || p.createdAt;
      const isNewCase = Date.now() - new Date(assignedAt).getTime() < NEW_CASE_WINDOW_MS;
      return {
        ...userCard(p, onlineUserIds),
        conversationId: conv?.id || null,
        lastMessage,
        unreadCount,
        latestResult: latestResult && {
          questionnaireId: latestResult.questionnaireId,
          score: latestResult.score,
          level: latestResult.level,
          label: latestResult.label,
          createdAt: latestResult.createdAt,
        },
        isNewCase,
        openAlerts,
        nextAppointment,
        assignedAt,
      };
    })
  );

  patients.sort((a, b) =>
    (b.lastMessage?.createdAt || b.assignedAt).localeCompare(a.lastMessage?.createdAt || a.assignedAt)
  );
  res.json({ patients });
});

// Guard: the target must be a patient assigned to THIS specialist.
async function findAssignedPatient(req, res) {
  const patient = await repos.findUserById(req.params.id);
  if (!patient || patient.role !== 'patient' || patient.assignedSpecialistId !== req.user.id) {
    res.status(404).json({ error: 'patient_not_found' });
    return null;
  }
  return patient;
}

// PUT /api/specialist/patients/:id/ai { enabled } — psychologists stay in
// control: switch the AI companion off (or back on) for their patient.
router.put('/patients/:id/ai', async (req, res) => {
  const patient = await findAssignedPatient(req, res);
  if (!patient) return;
  const enabled = req.body?.enabled !== false;
  const updated = await repos.updateUser(patient.id, {
    settings: { ...patient.settings, aiCompanion: enabled },
  });
  res.json({ patientId: updated.id, aiEnabled: updated.settings?.aiCompanion !== false });
});

// GET /api/specialist/patients/:id/checkins — the patient's daily check-ins
// (mood/stress/energy/sleep trends between sessions).
router.get('/patients/:id/checkins', async (req, res) => {
  const patient = await findAssignedPatient(req, res);
  if (!patient) return;
  res.json({
    entries: await repos.journalEntriesOf(patient.id, 30),
    aiEnabled: patient.settings?.aiCompanion !== false,
  });
});

module.exports = router;
