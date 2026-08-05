// Measurement-Based Care engine (Phase 2.2). Turns a column of questionnaire
// scores into the three things that actually change clinical decisions:
//
//   1. RELIABLE CHANGE — is this move bigger than the instrument's own
//      measurement error? A 3-point PHQ-9 change is noise; the RCI says when
//      it isn't (Jacobson & Truax, 1991).
//   2. NON-RESPONSE — less than 50% symptom reduction after 6-8 weeks of
//      treatment. This is the number that says "change the plan".
//   3. DETERIORATION — any increase on PHQ-9 item 9 (self-harm ideation)
//      between administrations, regardless of total score. Fires a safety
//      alert through the Phase 1.1 escalation ladder.
//
// HARD RULE, and the reason this is safe to build: none of this is ever
// returned to a patient, and nothing in the gamification layer may read it.
// The moment better numbers unlock anything, the questionnaires become
// fiction — and they are the data the clinician treats from. The only route
// exposing this lives under /api/specialist (approved specialists, assigned
// patients only).
const repos = require('../data/repos');
const alerts = require('./alertService');
const { getQuestionnaire } = require('../data/questionnaires');

// Published psychometrics used for the RCI. SD is the baseline standard
// deviation in the validation sample; r is test-retest reliability.
//   PHQ-9 — Kroenke, Spitzer & Williams (2001), J Gen Intern Med 16:606-613
//   GAD-7 — Spitzer, Kroenke, Williams & Löwe (2006), Arch Intern Med 166:1092
// Sdiff = SD * sqrt(1 - r) * sqrt(2); reliable change = |RCI| >= 1.96 (p<.05),
// which lands at ~7 points for PHQ-9 and ~6 for GAD-7 — consistent with the
// 5-6 point thresholds commonly reported for these instruments.
const PSYCHOMETRICS = {
  phq9: { sd: 6.1, reliability: 0.84, remissionBelow: 5, maxScore: 27 },
  gad7: { sd: 5.0, reliability: 0.83, remissionBelow: 5, maxScore: 21 },
};

const RCI_CRITICAL = 1.96;                       // two-tailed p < .05
const NON_RESPONSE_AFTER_MS = 42 * 24 * 60 * 60 * 1000;  // 6 weeks
const NON_RESPONSE_REDUCTION = 0.5;              // <50% reduction = non-response

const sdiffFor = ({ sd, reliability }) => sd * Math.sqrt(1 - reliability) * Math.SQRT2;

/** Point change needed before a move is more than measurement error. */
const reliableChangeThreshold = (questionnaireId) => {
  const p = PSYCHOMETRICS[questionnaireId];
  return p ? Number((RCI_CRITICAL * sdiffFor(p)).toFixed(1)) : null;
};

/**
 * Compares two administrations of the same instrument.
 * Returns { delta, rci, reliable, direction, remission, clinicallySignificant }
 * where direction is 'improved' | 'deteriorated' | 'unchanged' and delta is
 * signed as (later - earlier), so NEGATIVE means fewer symptoms.
 */
function compare(questionnaireId, earlierScore, laterScore) {
  const p = PSYCHOMETRICS[questionnaireId];
  if (!p) return null;
  const delta = laterScore - earlierScore;
  // Sign the RCI so positive = improvement, the convention clinicians read.
  const rci = (earlierScore - laterScore) / sdiffFor(p);
  const reliable = Math.abs(rci) >= RCI_CRITICAL;
  const remission = laterScore < p.remissionBelow;
  return {
    delta,
    rci: Number(rci.toFixed(2)),
    reliable,
    direction: !reliable ? 'unchanged' : delta < 0 ? 'improved' : 'deteriorated',
    remission,
    // Jacobson-Truax "recovered": reliable improvement AND below the clinical
    // cut-off. Either alone is not recovery.
    clinicallySignificant: reliable && delta < 0 && remission,
  };
}

/**
 * Full trajectory for one instrument. `results` are rows for a single
 * questionnaire, any order. Returns null when there is nothing to say.
 */
function trajectoryOf(questionnaireId, results) {
  const p = PSYCHOMETRICS[questionnaireId];
  if (!p || !results.length) return null;

  const ordered = [...results].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const baseline = ordered[0];
  const latest = ordered.at(-1);
  const previous = ordered.length > 1 ? ordered.at(-2) : null;

  const weeksInTreatment = (new Date(latest.createdAt) - new Date(baseline.createdAt)) / (7 * 24 * 3600_000);
  const reductionFromBaseline = baseline.score > 0
    ? (baseline.score - latest.score) / baseline.score
    : null;

  // Non-response: enough time has passed for treatment to show, and it hasn't.
  const longEnough = new Date(latest.createdAt) - new Date(baseline.createdAt) >= NON_RESPONSE_AFTER_MS;
  const nonResponse = !!(longEnough && reductionFromBaseline !== null && reductionFromBaseline < NON_RESPONSE_REDUCTION);

  return {
    questionnaireId,
    administrations: ordered.length,
    baseline: { score: baseline.score, level: baseline.level, at: baseline.createdAt },
    latest: { score: latest.score, level: latest.level, at: latest.createdAt },
    weeksInTreatment: Number(weeksInTreatment.toFixed(1)),
    reductionFromBaseline: reductionFromBaseline === null ? null : Number(reductionFromBaseline.toFixed(2)),
    reliableChangeThreshold: reliableChangeThreshold(questionnaireId),
    // vs the very first measurement (overall progress)
    sinceBaseline: ordered.length > 1 ? compare(questionnaireId, baseline.score, latest.score) : null,
    // vs the one before (what changed since the last session)
    sinceLast: previous ? compare(questionnaireId, previous.score, latest.score) : null,
    nonResponse,
    series: ordered.map((r) => ({ score: r.score, level: r.level, at: r.createdAt })),
  };
}

/** The self-harm item's answer for a PHQ-9 result row (null when absent). */
function crisisItemScore(result) {
  const questionnaire = getQuestionnaire(result.questionnaireId);
  if (!questionnaire || questionnaire.crisisItemIndex === null) return null;
  const answers = result.answers;
  if (!Array.isArray(answers)) return null;
  const value = answers[questionnaire.crisisItemIndex];
  return Number.isInteger(value) ? value : null;
}

/**
 * Everything the specialist sees for one patient: a trajectory per
 * instrument, plus the flags worth acting on.
 */
async function summaryFor(patientId) {
  const results = await repos.resultsOf(patientId);
  const byQuestionnaire = new Map();
  for (const r of results) {
    if (!byQuestionnaire.has(r.questionnaireId)) byQuestionnaire.set(r.questionnaireId, []);
    byQuestionnaire.get(r.questionnaireId).push(r);
  }

  const trajectories = [...byQuestionnaire.entries()]
    .map(([id, rows]) => trajectoryOf(id, rows))
    .filter(Boolean);

  // Item-9 history (specialist-only, PHQ-9): the column clinicians scan first.
  const selfHarmSeries = results
    .filter((r) => r.questionnaireId === 'phq9')
    .map((r) => ({ at: r.createdAt, value: crisisItemScore(r) }))
    .filter((p) => p.value !== null)
    .sort((a, b) => a.at.localeCompare(b.at));

  return {
    trajectories,
    selfHarmSeries,
    flags: {
      nonResponse: trajectories.filter((t) => t.nonResponse).map((t) => t.questionnaireId),
      deteriorating: trajectories
        .filter((t) => t.sinceLast?.direction === 'deteriorated')
        .map((t) => t.questionnaireId),
      selfHarmPresent: selfHarmSeries.at(-1)?.value > 0,
    },
  };
}

/**
 * The self-harm item's trajectory across this submission and the previous
 * PHQ-9 — the detail that turns a generic "item 9 > 0" page into a clinical
 * signal. "Ideation rose from 1 to 2 while the total score improved" is a
 * different case from "first time reporting any ideation", and the crisis
 * flag alone cannot tell them apart.
 *
 * Returns { from, to, rose, totalScore, previousResultId } or null when
 * there is no comparable prior administration.
 */
async function selfHarmTrend({ patient, result }) {
  if (result.questionnaireId !== 'phq9') return null;
  const to = crisisItemScore(result);
  if (to === null) return null;

  const previous = (await repos.resultsOf(patient.id))
    .filter((r) => r.questionnaireId === 'phq9' && r.id !== result.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!previous) return null;

  const from = crisisItemScore(previous);
  if (from === null) return null;

  return {
    from,
    to,
    rose: to > from,
    totalScore: { from: previous.score, to: result.score },
    previousResultId: previous.id,
  };
}

/**
 * Decides whether a submission must page, and with what detail — the single
 * decision point for questionnaire alerts (Phase 2.2).
 *
 * Pages when the PHQ-9 item-9 crisis flag trips (any ideation reported, the
 * pre-existing rule) OR when item 9 rose between administrations. One alert
 * per submission, never two, and its detail always carries the trajectory
 * when one exists.
 *
 * Returns the alert, or null when nothing needed raising.
 */
async function reviewSubmission({ patient, result, crisisFlag }) {
  const trend = await selfHarmTrend({ patient, result });
  if (!crisisFlag && !trend?.rose) return null;

  const alert = await alerts.raiseAlert({
    patient,
    source: 'questionnaire',
    resultId: result.id,
    detail: {
      risk: 'high',
      reason: trend?.rose ? 'phq9_item9_increase' : 'phq9_item9_positive',
      ...(trend ? { selfHarmItem: { from: trend.from, to: trend.to },
                    totalScore: trend.totalScore,
                    previousResultId: trend.previousResultId } : {}),
    },
  });
  if (trend?.rose) {
    console.log(`[mbc] PHQ-9 item 9 rose ${trend.from} -> ${trend.to} for ${patient.id} (total ${trend.totalScore.from} -> ${trend.totalScore.to}) — alert ${alert.id}`);
  }
  return alert;
}

module.exports = {
  summaryFor, trajectoryOf, compare, selfHarmTrend, reviewSubmission,
  reliableChangeThreshold, crisisItemScore, PSYCHOMETRICS,
};
