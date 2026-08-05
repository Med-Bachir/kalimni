const express = require('express');
const repos = require('../data/repos');
const { userCard, clinicalJournalEntry } = require('../utils/serialize');
const { requireAuth, requireApprovedSpecialist } = require('../middleware/auth');
const { onlineUserIds } = require('../realtime');
const mbc = require('../services/mbcService');

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
// Journal notes are no longer visible here by default (Phase 2.5): once a
// patient locks their journal, a note reaches this route only if they sealed
// that entry to this clinician. The sliders are unaffected — they are the
// measurement the treatment runs on, and locking them would cost the trend
// for no privacy gain. Entries the specialist cannot read are returned
// MARKED, not hidden.
router.get('/patients/:id/checkins', async (req, res) => {
  const patient = await findAssignedPatient(req, res);
  if (!patient) return;
  const [entries, shares] = await Promise.all([
    // 60 to match the patient's own endpoint: the trend chart compares two
    // 14-day windows and a patient may log more than once a day.
    repos.journalEntriesOf(patient.id, 60),
    repos.journalSharesFor(patient.id, req.user.id),
  ]);
  const envelopeByEntryId = new Map(shares.map((s) => [s.entryId, s.envelope]));
  res.json({
    entries: entries.map((e) => clinicalJournalEntry(e, envelopeByEntryId)),
    aiEnabled: patient.settings?.aiCompanion !== false,
  });
});

// GET /api/specialist/patients/:id/mbc — measurement-based care summary:
// PHQ-9/GAD-7 trajectories with reliable-change indices, the non-response
// flag, and the item-9 (self-harm) series.
//
// SPECIALIST-ONLY BY CONSTRUCTION (Phase 2.2). This router is behind
// requireApprovedSpecialist and findAssignedPatient, and no patient-facing
// route computes any of it: the moment a patient can see whether their
// numbers "improved", the questionnaires stop being the truthful clinical
// instrument the treatment depends on.
router.get('/patients/:id/mbc', async (req, res) => {
  const patient = await findAssignedPatient(req, res);
  if (!patient) return;
  res.json(await mbc.summaryFor(patient.id));
});

// GET /api/specialist/patients/:id/briefs — session briefs the patient CHOSE
// to send (Phase 2.3), newest first.
//
// `repos.sharedBriefsFor` filters on status = 'shared' in the SQL, and a
// shared brief no longer contains the items the patient unticked — they were
// deleted at send time, not hidden behind this query. Both facts matter: what
// a clinician sees here is exactly what their patient decided to say, and
// there is no draft to leak and nothing withheld to discover.
router.get('/patients/:id/briefs', async (req, res) => {
  const patient = await findAssignedPatient(req, res);
  if (!patient) return;
  res.json({ briefs: await repos.sharedBriefsFor(patient.id, req.user.id, 20) });
});

module.exports = router;
