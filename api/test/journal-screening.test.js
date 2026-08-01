// Phase 1.4 — journal notes join the safety net: keyword layer synchronous
// with the save, LLM layer async with dead-letter retries, and a low check-in
// surfaces the safety plan (soft signal, never an alarm).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  installRepos, installClassify, makeFakeRepos, buildApp, settle,
} = require('./helpers/harness.js');
const request = require('supertest');
const aiRouter = require('../src/routes/ai');
const worker = require('../src/workers/escalation');
const journalScreening = require('../src/services/journalScreeningService');
const { signToken } = require('../src/utils/tokens');

const CRISIS_NOTE = 'لا أريد العيش، تعبت من كل شيء';
const BENIGN_NOTE = 'يوم عادي، مشيت قليلاً وارتحت';

let fake;
let app;
let patient;
let specialist;
let bearer;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/ai': aiRouter });
  specialist = fake.seed.user({ role: 'specialist', status: 'approved' });
  patient = fake.seed.user({ role: 'patient', assignedSpecialistId: specialist.id });
  bearer = `Bearer ${signToken(patient)}`;
});
afterEach(() => installClassify(null));

const checkin = (body) =>
  request(app).post('/api/ai/checkin').set('Authorization', bearer)
    .send({ mood: 3, stress: 3, energy: 3, sleep: 3, ...body });

describe('journal note screening (1.4)', () => {
  it('a keyword crisis note raises a journal alert before the response returns', async () => {
    const res = await checkin({ note: CRISIS_NOTE });
    expect(res.status).toBe(201);
    const alerts = [...fake.state.alerts.values()];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toBe('journal');
    expect(alerts[0].detail.trigger).toContain('العيش');
    expect(alerts[0].detail.journalEntryId).toBe(res.body.entry.id);
    // ...and it went through the ladder: tier-0 page to the assigned specialist
    expect(fake.state.escalations.some((e) => e.alertId === alerts[0].id && e.notifiedId === specialist.id)).toBe(true);
  });

  it('the classifier catches indirect phrasing keywords miss', async () => {
    installClassify(async () => ({ risk: 'high', confidence: 0.9, reason: 'passive ideation in Arabizi' }));
    const res = await checkin({ note: 'makanch fayda, ykoun khir ki nkoun mch mawjoud' });
    expect(res.status).toBe(201);
    await settle();
    const alerts = [...fake.state.alerts.values()];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toBe('journal');
    expect(alerts[0].detail.classifier).toContain('ideation');
  });

  it('a benign note raises nothing', async () => {
    installClassify(async () => ({ risk: 'none', confidence: 0.95, reason: 'ordinary day' }));
    await checkin({ note: BENIGN_NOTE });
    await settle();
    expect([...fake.state.alerts.values()]).toHaveLength(0);
  });

  it('no note, no scan, no alert', async () => {
    installClassify(async () => { throw new Error('must not be called'); });
    const res = await checkin({});
    expect(res.status).toBe(201);
    await settle();
    expect([...fake.state.alerts.values()]).toHaveLength(0);
    expect(await fake.impl.countOpenRiskScanFailures()).toBe(0);
  });

  it('a classifier failure dead-letters and the worker retry raises the missed alert', async () => {
    installClassify(async () => { throw new Error('provider down'); });
    const res = await checkin({ note: 'nheb nemchi w nrtah men kolch' });
    await settle();
    expect(await fake.impl.countOpenRiskScanFailures()).toBe(1);
    expect([...fake.state.alerts.values()]).toHaveLength(0);

    installClassify(async () => ({ risk: 'high', confidence: 0.9, reason: 'death wish' }));
    await worker.sweepOnce();
    expect(await fake.impl.countOpenRiskScanFailures()).toBe(0);
    const alerts = [...fake.state.alerts.values()];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].detail.journalEntryId).toBe(res.body.entry.id);
  });

  it('classifyJournalAsync resolves quietly when the classifier is unconfigured', async () => {
    const entry = await fake.impl.insertJournalEntry({ userId: patient.id, mood: 3, note: BENIGN_NOTE });
    // real classify: AI_API_KEY is '' in tests -> returns null -> concluded
    expect(await journalScreening.classifyJournalAsync({ entry, user: patient })).toBe(true);
  });
});

describe('low check-in soft signal (1.4 -> 2.1)', () => {
  it('mood<=2 AND energy<=2 suggests the safety plan', async () => {
    const res = await checkin({ mood: 2, energy: 1 });
    expect(res.body.feedback.safetyPlanSuggested).toBe(true);
  });

  it('an ordinary check-in does not', async () => {
    const res = await checkin({ mood: 4, energy: 2 });
    expect(res.body.feedback.safetyPlanSuggested).toBe(false);
  });

  it('the soft signal never creates an alert', async () => {
    await checkin({ mood: 1, energy: 1 });
    await settle();
    expect([...fake.state.alerts.values()]).toHaveLength(0);
  });
});
