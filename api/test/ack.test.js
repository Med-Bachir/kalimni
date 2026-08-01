// Phase 1.1 — acknowledging is a clinical act: it requires the action taken,
// and the right people (treating specialist, anyone paged, admins) can do it.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const safetyRouter = require('../src/routes/safety');
const { signToken } = require('../src/utils/tokens');

let fake;
let app;
let patient;
let treating;
let onCall;
let stranger;
let admin;
let alert;
beforeEach(async () => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/safety': safetyRouter });
  patient = fake.seed.user({ role: 'patient' });
  treating = fake.seed.user({ role: 'specialist', status: 'approved' });
  onCall = fake.seed.user({ role: 'specialist', status: 'approved' });
  stranger = fake.seed.user({ role: 'specialist', status: 'approved' });
  admin = fake.seed.user({ role: 'admin' });
  alert = await fake.impl.insertSafetyAlert({
    patientId: patient.id, specialistId: treating.id, source: 'ai_chat', status: 'open',
    detail: { risk: 'high', hold: true },
  });
  await fake.impl.insertAlertEscalation({ alertId: alert.id, tier: 0, notifiedId: onCall.id, method: 'page' });
});

const ackAs = (user, body) =>
  request(app).post(`/api/safety/alerts/${alert.id}/ack`).set('Authorization', `Bearer ${signToken(user)}`).send(body);

describe('POST /api/safety/alerts/:id/ack (1.1)', () => {
  it('refuses an ack with no recorded action', async () => {
    const res = await ackAs(treating, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('action_taken_required');
    expect((await fake.impl.findSafetyAlert(alert.id)).status).toBe('open');
  });

  it('treating specialist acks with the action recorded in the audit', async () => {
    const res = await ackAs(treating, { actionTaken: 'اتصلت بالمريض وقيّمت الحالة، جلسة غداً' });
    expect(res.status).toBe(200);
    expect(res.body.alert.status).toBe('acknowledged');
    const ackRow = fake.state.escalations.find((e) => e.method === 'ack');
    expect(ackRow.notifiedId).toBe(treating.id);
    expect(ackRow.actionTaken).toContain('اتصلت');
    // every page row is stamped acknowledged
    expect(fake.state.escalations.filter((e) => e.method === 'page').every((e) => e.acknowledgedAt)).toBe(true);
  });

  it('a specialist who was PAGED for it (on-call) can ack', async () => {
    const res = await ackAs(onCall, { actionTaken: 'Appel au patient, situation stabilisée.' });
    expect(res.status).toBe(200);
  });

  it('an unrelated specialist cannot', async () => {
    const res = await ackAs(stranger, { actionTaken: 'je passe par là' });
    expect(res.status).toBe(403);
  });

  it('an admin can, and double-ack is refused', async () => {
    expect((await ackAs(admin, { actionTaken: 'Called the on-call specialist and confirmed contact.' })).status).toBe(200);
    expect((await ackAs(admin, { actionTaken: 'again for good measure' })).status).toBe(409);
  });

  it('the on-call specialist SEES the alert in their list (visibility follows the page)', async () => {
    const res = await request(app).get('/api/safety/alerts').set('Authorization', `Bearer ${signToken(onCall)}`);
    expect(res.status).toBe(200);
    expect(res.body.alerts.map((a) => a.id)).toContain(alert.id);
    const other = await request(app).get('/api/safety/alerts').set('Authorization', `Bearer ${signToken(stranger)}`);
    expect(other.body.alerts).toHaveLength(0);
  });
});
