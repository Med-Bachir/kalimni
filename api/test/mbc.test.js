// Phase 2.2 — the MBC engine. Three things must hold: the arithmetic is
// right, a rising item 9 always pages, and none of it ever reaches a patient.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const mbc = require('../src/services/mbcService');
const specialistRouter = require('../src/routes/specialist');
const questionnairesRouter = require('../src/routes/questionnaires');
const aiRouter = require('../src/routes/ai');
const { signToken } = require('../src/utils/tokens');

const DAY = 24 * 3600_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

// PHQ-9 answers whose 9th item (index 8) is `item9`, totalling `score`.
function phq9Answers(score, item9 = 0) {
  const answers = new Array(9).fill(0);
  answers[8] = item9;
  let remaining = score - item9;
  for (let i = 0; i < 8 && remaining > 0; i++) {
    const take = Math.min(3, remaining);
    answers[i] = take;
    remaining -= take;
  }
  return answers;
}

let fake;
let app;
let patient;
let specialist;
let otherSpecialist;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({
    '/api/specialist': specialistRouter,
    '/api/questionnaires': questionnairesRouter,
    '/api/ai': aiRouter,
  });
  specialist = fake.seed.user({ role: 'specialist', status: 'approved' });
  otherSpecialist = fake.seed.user({ role: 'specialist', status: 'approved' });
  patient = fake.seed.user({ role: 'patient', assignedSpecialistId: specialist.id });

  // Results live in the fake as a simple array the repo reads back.
  const results = [];
  fake.state.results = results;
  fake.impl.insertQuestionnaireResult = async (r) => {
    const row = { id: `qr_${results.length + 1}`, createdAt: new Date().toISOString(), ...r };
    results.push(row);
    return row;
  };
  fake.impl.resultsOf = async (userId) => results.filter((r) => r.userId === userId);
});

const seedResult = (props) => {
  const row = {
    id: `qr_seed_${fake.state.results.length + 1}`,
    userId: patient.id, questionnaireId: 'phq9', level: 'moderate',
    createdAt: new Date().toISOString(), ...props,
  };
  fake.state.results.push(row);
  return row;
};

describe('reliable change index (2.2)', () => {
  it('the PHQ-9 threshold lands where the literature puts it (~6-7 points)', () => {
    const t = mbc.reliableChangeThreshold('phq9');
    expect(t).toBeGreaterThan(5.5);
    expect(t).toBeLessThan(7.5);
  });

  it('a 3-point PHQ-9 move is noise, not change', () => {
    const c = mbc.compare('phq9', 18, 15);
    expect(c.reliable).toBe(false);
    expect(c.direction).toBe('unchanged');
    expect(c.delta).toBe(-3);
  });

  it('a 10-point drop is reliable improvement', () => {
    const c = mbc.compare('phq9', 20, 10);
    expect(c.reliable).toBe(true);
    expect(c.direction).toBe('improved');
    expect(c.rci).toBeGreaterThan(1.96);
  });

  it('a big rise is reliable deterioration', () => {
    const c = mbc.compare('phq9', 8, 20);
    expect(c.reliable).toBe(true);
    expect(c.direction).toBe('deteriorated');
  });

  it('recovery needs BOTH reliable improvement and crossing the clinical cut-off', () => {
    // improved a lot but still symptomatic
    expect(mbc.compare('phq9', 24, 14).clinicallySignificant).toBe(false);
    // improved reliably AND below 5
    expect(mbc.compare('phq9', 18, 3).clinicallySignificant).toBe(true);
    // already low, tiny move — not "recovery" on this episode
    expect(mbc.compare('phq9', 6, 4).clinicallySignificant).toBe(false);
  });

  it('GAD-7 uses its own psychometrics', () => {
    expect(mbc.reliableChangeThreshold('gad7')).not.toBe(mbc.reliableChangeThreshold('phq9'));
    expect(mbc.compare('gad7', 16, 4).clinicallySignificant).toBe(true);
  });

  it('an unknown instrument returns null rather than guessing', () => {
    expect(mbc.compare('made-up', 10, 2)).toBeNull();
    expect(mbc.reliableChangeThreshold('made-up')).toBeNull();
  });
});

describe('non-response flag (2.2)', () => {
  it('flags <50% reduction after 6+ weeks', async () => {
    seedResult({ score: 20, createdAt: daysAgo(60), answers: phq9Answers(20) });
    seedResult({ score: 17, createdAt: daysAgo(1), answers: phq9Answers(17) });
    const { trajectories } = await mbc.summaryFor(patient.id);
    const phq = trajectories.find((t) => t.questionnaireId === 'phq9');
    expect(phq.nonResponse).toBe(true);
    expect(phq.reductionFromBaseline).toBeLessThan(0.5);
  });

  it('does not flag a responder', async () => {
    seedResult({ score: 20, createdAt: daysAgo(60), answers: phq9Answers(20) });
    seedResult({ score: 6, createdAt: daysAgo(1), answers: phq9Answers(6) });
    const { trajectories } = await mbc.summaryFor(patient.id);
    expect(trajectories[0].nonResponse).toBe(false);
  });

  it('does not flag before enough time has passed', async () => {
    seedResult({ score: 20, createdAt: daysAgo(10), answers: phq9Answers(20) });
    seedResult({ score: 19, createdAt: daysAgo(1), answers: phq9Answers(19) });
    const { trajectories } = await mbc.summaryFor(patient.id);
    expect(trajectories[0].nonResponse).toBe(false);
  });

  it('a single administration yields no comparisons', async () => {
    seedResult({ score: 15, answers: phq9Answers(15) });
    const { trajectories } = await mbc.summaryFor(patient.id);
    expect(trajectories[0].sinceBaseline).toBeNull();
    expect(trajectories[0].sinceLast).toBeNull();
    expect(trajectories[0].nonResponse).toBe(false);
  });
});

describe('item-9 deterioration alarm (2.2)', () => {
  const submit = (answers) =>
    request(app).post('/api/questionnaires/phq9/submit')
      .set('Authorization', `Bearer ${signToken(patient)}`)
      .send({ answers });

  it('a rise in item 9 pages the specialist even when the TOTAL improved', async () => {
    // previous: high total, item 9 = 1
    seedResult({ score: 22, createdAt: daysAgo(14), answers: phq9Answers(22, 1) });

    // now: much better total, but item 9 went 1 -> 2
    const res = await submit(phq9Answers(12, 2));
    expect(res.status).toBe(201);

    const raised = [...fake.state.alerts.values()];
    expect(raised).toHaveLength(1);
    expect(raised[0].detail.reason).toBe('phq9_item9_increase');
    expect(raised[0].detail.selfHarmItem).toEqual({ from: 1, to: 2 });
    expect(raised[0].detail.totalScore).toEqual({ from: 22, to: 12 });
    // and it went through the ladder
    expect(fake.state.escalations.some((e) => e.alertId === raised[0].id && e.tier === 0)).toBe(true);
  });

  it('a falling item 9 still pages (any ideation does) but is not marked as a rise', async () => {
    seedResult({ score: 20, createdAt: daysAgo(14), answers: phq9Answers(20, 3) });
    await submit(phq9Answers(18, 1));
    const raised = [...fake.state.alerts.values()];
    expect(raised).toHaveLength(1);
    expect(raised[0].detail.reason).toBe('phq9_item9_positive');
    expect(raised[0].detail.selfHarmItem).toEqual({ from: 3, to: 1 });
  });

  it('item 9 back to 0 raises nothing at all', async () => {
    seedResult({ score: 20, createdAt: daysAgo(14), answers: phq9Answers(20, 2) });
    await submit(phq9Answers(9, 0));
    expect([...fake.state.alerts.values()]).toHaveLength(0);
  });

  it('0 -> 1 pages exactly once, carrying the trajectory', async () => {
    seedResult({ score: 10, createdAt: daysAgo(14), answers: phq9Answers(10, 0) });
    await submit(phq9Answers(11, 1));
    const raised = [...fake.state.alerts.values()];
    expect(raised).toHaveLength(1);
    expect(raised[0].detail.reason).toBe('phq9_item9_increase');
    expect(raised[0].detail.selfHarmItem).toEqual({ from: 0, to: 1 });
  });

  it('the first ever PHQ-9 with ideation pages, with no trajectory to report', async () => {
    await submit(phq9Answers(14, 2));
    const raised = [...fake.state.alerts.values()];
    expect(raised).toHaveLength(1);
    expect(raised[0].detail.reason).toBe('phq9_item9_positive');
    expect(raised[0].detail.selfHarmItem).toBeUndefined();
  });

  it('a clean first PHQ-9 raises nothing', async () => {
    await submit(phq9Answers(14, 0));
    expect([...fake.state.alerts.values()]).toHaveLength(0);
  });

  it('GAD-7 has no item 9 and never triggers it', async () => {
    seedResult({ questionnaireId: 'gad7', score: 8, createdAt: daysAgo(14), answers: new Array(7).fill(1) });
    const res = await request(app).post('/api/questionnaires/gad7/submit')
      .set('Authorization', `Bearer ${signToken(patient)}`)
      .send({ answers: new Array(7).fill(2) });
    expect(res.status).toBe(201);
    expect([...fake.state.alerts.values()]).toHaveLength(0);
  });
});

describe('MBC is specialist-only (2.2 hard rule)', () => {
  beforeEach(() => {
    seedResult({ score: 20, createdAt: daysAgo(60), answers: phq9Answers(20, 2) });
    seedResult({ score: 8, createdAt: daysAgo(1), answers: phq9Answers(8, 1) });
  });

  it('the assigned specialist sees trajectories, flags and the item-9 series', async () => {
    const res = await request(app)
      .get(`/api/specialist/patients/${patient.id}/mbc`)
      .set('Authorization', `Bearer ${signToken(specialist)}`);
    expect(res.status).toBe(200);
    expect(res.body.trajectories[0].sinceBaseline.direction).toBe('improved');
    expect(res.body.selfHarmSeries.map((p) => p.value)).toEqual([2, 1]);
    expect(res.body.flags.selfHarmPresent).toBe(true);
  });

  it('another specialist cannot', async () => {
    const res = await request(app)
      .get(`/api/specialist/patients/${patient.id}/mbc`)
      .set('Authorization', `Bearer ${signToken(otherSpecialist)}`);
    expect(res.status).toBe(404);
  });

  it('the PATIENT cannot — not on the MBC route', async () => {
    const res = await request(app)
      .get(`/api/specialist/patients/${patient.id}/mbc`)
      .set('Authorization', `Bearer ${signToken(patient)}`);
    expect(res.status).toBe(403);
  });

  it('...and not through their own questionnaire history', async () => {
    const res = await request(app).get('/api/questionnaires/history')
      .set('Authorization', `Bearer ${signToken(patient)}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    for (const leak of ['rci', 'reliable', 'nonResponse', 'clinicallySignificant', 'trajector']) {
      expect(body).not.toContain(leak);
    }
  });

  it('...and not through the check-ins the patient reads', async () => {
    const res = await request(app).get('/api/ai/checkins')
      .set('Authorization', `Bearer ${signToken(patient)}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('rci');
  });
});
