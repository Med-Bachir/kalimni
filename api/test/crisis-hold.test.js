// Phase 0.3 — the crisis hold must survive every way a thread can disappear.
// Done-when from the master plan: crisis message -> DELETE /api/ai/history ->
// new message, and the crisis reply is still returned.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const aiRouter = require('../src/routes/ai');
const { signToken } = require('../src/utils/tokens');

const CRISIS_TEXT = 'أريد أن أنهي حياتي، لم أعد أحتمل'; // keyword-layer hit
const BENIGN_TEXT = 'كيف حالك اليوم؟';

let fake;
let app;
let patient;
let bearer;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/ai': aiRouter });
  patient = fake.seed.user({ role: 'patient', language: 'ar' });
  bearer = `Bearer ${signToken(patient)}`;
});

const chat = (text) =>
  request(app).post('/api/ai/chat').set('Authorization', bearer).send({ text });

describe('crisis hold survives thread deletion (0.3)', () => {
  it('a crisis message opens an alert and holds the conversation', async () => {
    const res = await chat(CRISIS_TEXT);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('crisis_hold');
    expect(res.body.reply.role).toBe('crisis');
    expect(res.body.resources).toBeTruthy();
    const alerts = [...fake.state.alerts.values()];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toBe('ai_chat');
    expect(alerts[0].status).toBe('open');
  });

  it('DELETE /api/ai/history is refused (409) while the alert is open', async () => {
    await chat(CRISIS_TEXT);
    const res = await request(app).delete('/api/ai/history').set('Authorization', bearer);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('crisis_hold_active');
    expect(res.body.resources).toBeTruthy();
    // the thread was NOT deleted
    expect(fake.state.aiConversations.get(patient.id)).toBeTruthy();
  });

  it('the full done-when sequence: crisis -> delete attempt -> new message still gets the crisis reply', async () => {
    await chat(CRISIS_TEXT);
    await request(app).delete('/api/ai/history').set('Authorization', bearer); // 409, ignored by an old client
    const res = await chat(BENIGN_TEXT);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('crisis_hold');
    expect(res.body.reply.role).toBe('crisis');
  });

  it('REGRESSION: even if the thread row is wiped, the open alert still enforces the hold', async () => {
    await chat(CRISIS_TEXT);
    // Simulate the old bypass at the data layer: thread gone, alert open.
    await fake.impl.deleteAiThread(patient.id);
    expect(fake.state.aiConversations.get(patient.id)).toBeUndefined();

    const res = await chat(BENIGN_TEXT);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('crisis_hold'); // fresh row defaulted 'active' — alert wins
    expect(res.body.reply.role).toBe('crisis');
    expect(fake.state.aiConversations.get(patient.id).status).toBe('crisis_hold');
  });

  it('GET /api/ai/history reports the hold even on a recreated thread', async () => {
    await chat(CRISIS_TEXT);
    await fake.impl.deleteAiThread(patient.id);
    const res = await request(app).get('/api/ai/history').set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.conversation.status).toBe('crisis_hold');
  });

  it('acknowledging the alert releases the hold', async () => {
    await chat(CRISIS_TEXT);
    const alert = [...fake.state.alerts.values()][0];
    await fake.impl.updateSafetyAlert(alert.id, { status: 'acknowledged' });

    // Generation now proceeds past the gate; with no AI key configured the
    // companion reports unavailable (503) — proof it LEFT the crisis path.
    const res = await chat(BENIGN_TEXT);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ai_unavailable');
    expect(fake.state.aiConversations.get(patient.id).status).toBe('active');
  });

  it('after acknowledgement the wipe succeeds and redacts the stored trigger excerpt', async () => {
    await chat(CRISIS_TEXT);
    const alert = [...fake.state.alerts.values()][0];
    expect(alert.detail.trigger).toContain('أنهي حياتي');

    await fake.impl.updateSafetyAlert(alert.id, { status: 'acknowledged' });
    const res = await request(app).delete('/api/ai/history').set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(fake.state.aiConversations.get(patient.id)).toBeUndefined();
    expect(alert.detail.trigger).toBeUndefined();
    expect(alert.detail.triggerRedacted).toBe(true);
    expect(alert.detail.risk).toBe('high'); // clinical record survives
  });
});
