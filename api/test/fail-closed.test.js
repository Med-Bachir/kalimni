// Phase 1.2 — the safety net fails LOUD and CLOSED: unparseable classifier
// output on risk-adjacent text is treated as high; failed scans are
// dead-lettered and retried by the worker; nothing disappears silently.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  installRepos, installChatJson, makeFakeRepos,
} = require('./helpers/harness.js');
const config = require('../src/config');
const risk = require('../src/services/riskService');
const worker = require('../src/workers/escalation');
const { scanForRiskAdjacent } = require('../src/utils/safety');

let fake;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  // classify() short-circuits to null without a key; these tests exercise the
  // configured path with the LLM call itself patched.
  config.aiApiKey = 'test-key-for-classifier';
});
afterEach(() => {
  installChatJson(null);
  config.aiApiKey = '';
});

describe('risk-adjacent vocabulary scan', () => {
  it('flags adjacent phrasing across languages', () => {
    expect(scanForRiskAdjacent('راني تعبت، نحب نرتاح من كلش')).toBe(true);
    expect(scanForRiskAdjacent("j'ai peur de la mort")).toBe(true);
    expect(scanForRiskAdjacent('nmout w nkhlas')).toBe(true);
    expect(scanForRiskAdjacent('كيف حال الطقس اليوم؟')).toBe(false);
    expect(scanForRiskAdjacent('rendez-vous demain à 10h')).toBe(false);
  });
});

describe('classifier fails CLOSED on unparseable output (1.2)', () => {
  it('adjacent text + unparseable model output => high', async () => {
    const parseError = Object.assign(new Error('ai_unparseable_json'), { parseError: true });
    installChatJson(async () => { throw parseError; });
    const result = await risk.classify('نحب نموت');
    expect(result.risk).toBe('high');
    expect(result.reason).toContain('fail_closed');
  });

  it('non-adjacent text + unparseable output => error propagates (no fake alarm)', async () => {
    const parseError = Object.assign(new Error('ai_unparseable_json'), { parseError: true });
    installChatJson(async () => { throw parseError; });
    await expect(risk.classify('bonjour, comment réserver une séance ?')).rejects.toThrow();
  });

  it('an invalid risk value on adjacent text also fails closed', async () => {
    installChatJson(async () => ({ risk: 'banana', confidence: 1 }));
    const result = await risk.classify('je veux mourir peut-être');
    expect(result.risk).toBe('high');
  });

  it('a valid verdict updates the health snapshot', async () => {
    installChatJson(async () => ({ risk: 'none', confidence: 0.9, reason: 'benign' }));
    await risk.classify('bonjour');
    expect(risk.healthSnapshot().lastClassifiedAt).toBeTruthy();
  });
});

describe('dead-letter queue + worker retry (1.2)', () => {
  it('a failed chat scan is recorded, then resolved when the retry succeeds', async () => {
    const patient = fake.seed.user({ role: 'patient' });
    const specialist = fake.seed.user({ role: 'specialist', status: 'approved' });
    const conversation = fake.seed.conversation(patient, specialist);
    const message = await fake.impl.insertMessage({
      conversationId: conversation.id, senderId: patient.id, text: 'rani 3yit bzf had lyam',
    });

    // Provider down: the scan fails and dead-letters instead of vanishing.
    installChatJson(async () => { throw new Error('provider 500'); });
    const ok = await risk.scanMessageAsync({ message, sender: patient, conversation });
    expect(ok).toBe(false);
    expect(await fake.impl.countOpenRiskScanFailures()).toBe(1);

    // Provider back: the escalation worker's sweep retries and resolves it.
    installChatJson(async () => ({ risk: 'low', confidence: 0.7, reason: 'exhaustion, no death reference' }));
    await worker.sweepOnce();
    expect(await fake.impl.countOpenRiskScanFailures()).toBe(0);
  });

  it('a retry that finds risk raises the alert through the ladder', async () => {
    const patient = fake.seed.user({ role: 'patient' });
    const specialist = fake.seed.user({ role: 'specialist', status: 'approved' });
    patient.assignedSpecialistId = specialist.id;
    const conversation = fake.seed.conversation(patient, specialist);
    const message = await fake.impl.insertMessage({
      conversationId: conversation.id, senderId: patient.id, text: 'nheb nemchi men had denya',
    });

    installChatJson(async () => { throw new Error('provider 500'); });
    await risk.scanMessageAsync({ message, sender: patient, conversation });

    installChatJson(async () => ({ risk: 'high', confidence: 0.92, reason: 'passive ideation' }));
    await worker.sweepOnce();

    const alerts = [...fake.state.alerts.values()];
    expect(alerts).toHaveLength(1);
    expect((await fake.impl.findMessage(message.id)).riskFlag).toBe(true);
    // and the new alert got its tier-0 page
    expect(fake.state.escalations.some((e) => e.alertId === alerts[0].id && e.tier === 0)).toBe(true);
  });
});
