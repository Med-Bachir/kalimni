// Phase 1.3 — the alert and the hold are separate decisions. A keyword hit
// the classifier reads as safe pages the specialist WITHOUT pausing support;
// the hold engages only on classifier-confirmed high, or classifier-down.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  installRepos, installClassify, installChatJson, makeFakeRepos, buildApp,
} = require('./helpers/harness.js');
const request = require('supertest');
const aiRouter = require('../src/routes/ai');
const { signToken } = require('../src/utils/tokens');

// Keyword layer hits on the bare substring 'mourir' — the textbook panic
// phrasing the split exists for.
const PANIC_TEXT = "j'ai peur de mourir, mon cœur bat très fort";
const COMPANION_JSON = { reply: 'أنا معك، لنتنفس معاً.', emotion: 'panic', exerciseKey: 'grounding54321' };

let fake;
let app;
let patient;
let bearer;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  installChatJson(async () => COMPANION_JSON); // generation succeeds
  app = buildApp({ '/api/ai': aiRouter });
  patient = fake.seed.user({ role: 'patient', language: 'fr' });
  bearer = `Bearer ${signToken(patient)}`;
});
afterEach(() => {
  installClassify(null);
  installChatJson(null);
});

const chat = (text) => request(app).post('/api/ai/chat').set('Authorization', bearer).send({ text });

describe('hold/alert split (1.3)', () => {
  it('keyword hit + classifier says none: alert WITHOUT hold, support continues', async () => {
    installClassify(async () => ({ risk: 'none', confidence: 0.9, reason: 'panic metaphor, no death wish' }));

    const res = await chat(PANIC_TEXT);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');            // NOT locked out
    expect(res.body.reply.role).toBe('assistant');     // real support, not the crisis wall

    const alerts = [...fake.state.alerts.values()];
    expect(alerts).toHaveLength(1);                    // specialist still paged
    expect(alerts[0].detail).toMatchObject({ hold: false, keywordHit: true, risk: 'none' });

    // ...and the open no-hold alert does not pause the next message either.
    const next = await chat('merci, ça va un peu mieux');
    expect(next.body.status).toBe('active');
  });

  it('keyword hit + classifier confirms high: full crisis path with hold', async () => {
    installClassify(async () => ({ risk: 'high', confidence: 0.95, reason: 'active ideation' }));
    const res = await chat('je veux en finir');
    expect(res.body.status).toBe('crisis_hold');
    expect(res.body.reply.role).toBe('crisis');
    expect([...fake.state.alerts.values()][0].detail.hold).toBe(true);
  });

  it('classifier catches what keywords miss: high without keyword still holds', async () => {
    installClassify(async () => ({ risk: 'high', confidence: 0.9, reason: 'Arabizi passive ideation' }));
    const res = await chat('makanch fayda, kolchi ykoun khir ki nkoun mch mawjoud');
    expect(res.body.status).toBe('crisis_hold');
  });

  it('keyword hit + classifier DOWN: fail closed into the crisis path', async () => {
    installClassify(async () => { throw new Error('provider 500'); });
    const res = await chat(PANIC_TEXT);
    expect(res.body.status).toBe('crisis_hold');
    expect([...fake.state.alerts.values()][0].detail.hold).toBe(true);
  });

  it('keyword hit + classifier UNCONFIGURED (null): fail closed too', async () => {
    installClassify(async () => null);
    const res = await chat(PANIC_TEXT);
    expect(res.body.status).toBe('crisis_hold');
  });

  it('a no-hold alert does not block the thread wipe', async () => {
    installClassify(async () => ({ risk: 'none', confidence: 0.9, reason: 'metaphor' }));
    await chat(PANIC_TEXT);
    const res = await request(app).delete('/api/ai/history').set('Authorization', bearer);
    expect(res.status).toBe(200);
  });

  it('legacy alerts without detail.hold still hold (fail-safe default)', async () => {
    await fake.impl.insertSafetyAlert({
      patientId: patient.id, source: 'ai_chat', status: 'open',
      detail: { risk: 'high', trigger: 'x' }, // pre-split shape: no hold key
    });
    installClassify(async () => ({ risk: 'none', confidence: 0.9, reason: 'benign' }));
    const res = await chat('bonjour');
    expect(res.body.status).toBe('crisis_hold');
  });
});
