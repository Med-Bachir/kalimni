const express = require('express');
const repos = require('../data/repos');
const { QUESTIONNAIRES, getQuestionnaire, scoreQuestionnaire } = require('../data/questionnaires');
const { requireAuth } = require('../middleware/auth');
const { emitToUser, emitToAdmins } = require('../realtime');
const push = require('../services/pushService');

const router = express.Router();
router.use(requireAuth);

// GET /api/questionnaires — full definitions (both languages; client picks).
router.get('/', (_req, res) => {
  res.json({ questionnaires: QUESTIONNAIRES });
});

// POST /api/questionnaires/:id/submit { answers: number[] }
router.post('/:id/submit', async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ error: 'forbidden' });
  const questionnaire = getQuestionnaire(req.params.id);
  if (!questionnaire) return res.status(404).json({ error: 'questionnaire_not_found' });

  const scored = scoreQuestionnaire(questionnaire, (req.body || {}).answers);
  if (!scored) return res.status(400).json({ error: 'answers_invalid' });

  const result = await repos.insertQuestionnaireResult({
    userId: req.user.id, questionnaireId: questionnaire.id,
    answers: req.body.answers, ...scored,
  });

  await repos.updateUser(req.user.id, {
    intakeCompletedAt: new Date().toISOString(),
    intakeSkipped: false,
  });

  // No specialist yet and no open request -> enter the matching queue so the
  // admin sees the new case with its score context.
  let matchingRequest = null;
  if (!req.user.assignedSpecialistId && !(await repos.hasOpenMatchingRequest(req.user.id))) {
    matchingRequest = await repos.insertMatchingRequest({
      patientId: req.user.id, type: 'match', status: 'new',
      context: { questionnaireId: questionnaire.id, score: scored.score, level: scored.level },
    });
    emitToAdmins('matching:new', { request: matchingRequest });
  }

  // PHQ-9 item 9 safety protocol: alert assigned specialist (or admins).
  if (scored.crisisFlag) {
    const alert = await repos.insertSafetyAlert({
      patientId: req.user.id,
      specialistId: req.user.assignedSpecialistId || null,
      resultId: result.id, source: 'questionnaire', status: 'open',
    });
    if (alert.specialistId) emitToUser(alert.specialistId, 'safety:alert', { alert });
    emitToAdmins('safety:alert', { alert });
    push.pushSafetyAlert({ alert, patient: req.user }); // fire-and-forget
  }

  res.status(201).json({ result, matchingRequest });
});

// POST /api/questionnaires/skip — patient chose to skip intake for now.
router.post('/skip', async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ error: 'forbidden' });
  if (!req.user.intakeCompletedAt) await repos.updateUser(req.user.id, { intakeSkipped: true });
  res.json({ ok: true });
});

// GET /api/questionnaires/history[?patientId=] — own history; specialists can
// read history of their assigned patients, admins of anyone.
router.get('/history', async (req, res) => {
  let targetId = req.user.id;
  const { patientId } = req.query;
  if (patientId && patientId !== req.user.id) {
    const patient = await repos.findUserById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ error: 'patient_not_found' });
    const allowed =
      req.user.role === 'admin' ||
      (req.user.role === 'specialist' && patient.assignedSpecialistId === req.user.id);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    targetId = patientId;
  }
  res.json({ results: await repos.resultsOf(targetId) });
});

module.exports = router;
