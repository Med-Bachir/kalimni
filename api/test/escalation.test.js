// Phase 1.1 done-when: a crisis from an UNASSIGNED patient pages a human
// immediately, re-pages at 15 minutes, and goes critical (every admin) at 60.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const aiRouter = require('../src/routes/ai');
const worker = require('../src/workers/escalation');
const { signToken } = require('../src/utils/tokens');

const CRISIS_TEXT = 'أريد أن أنهي حياتي، لم أعد أحتمل';
const HOUR = 60 * 60_000;

let fake;
let app;
let patient;
let onCall1;
let onCall2;
let admin;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/ai': aiRouter });
  patient = fake.seed.user({ role: 'patient', assignedSpecialistId: null }); // UNASSIGNED
  onCall1 = fake.seed.user({ role: 'specialist', status: 'approved' });
  onCall2 = fake.seed.user({ role: 'specialist', status: 'approved' });
  admin = fake.seed.user({ role: 'admin' });
  const now = Date.now();
  fake.state.rota.set('r1', {
    id: 'r1', specialistId: onCall1.id, tier: 1,
    startsAt: new Date(now - HOUR).toISOString(), endsAt: new Date(now + 24 * HOUR).toISOString(),
  });
  fake.state.rota.set('r2', {
    id: 'r2', specialistId: onCall2.id, tier: 2,
    startsAt: new Date(now - HOUR).toISOString(), endsAt: new Date(now + 24 * HOUR).toISOString(),
  });
});

const crisis = () =>
  request(app).post('/api/ai/chat').set('Authorization', `Bearer ${signToken(patient)}`).send({ text: CRISIS_TEXT });

const pagesFor = (alertId) => fake.state.escalations.filter((e) => e.alertId === alertId && e.method !== 'ack');

describe('escalation ladder for an unassigned patient (1.1)', () => {
  it('tier 0: the on-call specialist is paged at alert creation, not nobody', async () => {
    await crisis();
    const alert = [...fake.state.alerts.values()][0];
    expect(alert.specialistId).toBeNull(); // unassigned stays unassigned
    const pages = pagesFor(alert.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ tier: 0, notifiedId: onCall1.id, method: 'page' });
  });

  it('a second sweep inside 15 minutes adds nothing (no page spam)', async () => {
    await crisis();
    const alert = [...fake.state.alerts.values()][0];
    await worker.sweepOnce(new Date(alert.createdAt).getTime() + 5 * 60_000);
    expect(pagesFor(alert.id)).toHaveLength(1);
  });

  it('t+15min unacknowledged: re-page original target plus the tier-2 backup', async () => {
    await crisis();
    const alert = [...fake.state.alerts.values()][0];
    await worker.sweepOnce(new Date(alert.createdAt).getTime() + 16 * 60_000);
    const pages = pagesFor(alert.id);
    const repages = pages.filter((p) => p.method === 'repage');
    expect(repages.map((p) => p.notifiedId).sort()).toEqual([onCall1.id, onCall2.id].sort());
    expect(repages.every((p) => p.tier === 1)).toBe(true);
  });

  it('t+60min unacknowledged: every admin is paged as critical, and the alert shows in the critical list', async () => {
    await crisis();
    const alert = [...fake.state.alerts.values()][0];
    const t0 = new Date(alert.createdAt).getTime();
    await worker.sweepOnce(t0 + 16 * 60_000);
    await worker.sweepOnce(t0 + 61 * 60_000);
    const critical = pagesFor(alert.id).filter((p) => p.method === 'critical');
    expect(critical).toHaveLength(1);
    expect(critical[0]).toMatchObject({ tier: 2, notifiedId: admin.id });
    expect(await fake.impl.listCriticalOpenAlerts()).toHaveLength(1);
  });

  it('an acknowledged alert stops escalating', async () => {
    await crisis();
    const alert = [...fake.state.alerts.values()][0];
    await fake.impl.updateSafetyAlert(alert.id, { status: 'acknowledged' });
    await worker.sweepOnce(new Date(alert.createdAt).getTime() + 61 * 60_000);
    expect(pagesFor(alert.id)).toHaveLength(1); // only the tier-0 page
  });

  it('empty rota: admins are paged at tier 0 rather than nobody', async () => {
    fake.state.rota.clear();
    await crisis();
    const alert = [...fake.state.alerts.values()][0];
    const pages = pagesFor(alert.id);
    expect(pages.map((p) => p.notifiedId)).toContain(admin.id);
  });

  it('assigned patient: tier 0 goes to the treating specialist', async () => {
    const specialist = fake.seed.user({ role: 'specialist', status: 'approved' });
    patient.assignedSpecialistId = specialist.id;
    await crisis();
    const alert = [...fake.state.alerts.values()][0];
    expect(alert.specialistId).toBe(specialist.id);
    expect(pagesFor(alert.id)[0].notifiedId).toBe(specialist.id);
  });
});
