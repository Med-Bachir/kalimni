// Phase 2.5 — client-side encrypted journal.
//
// The privacy property is easy: the server stores ciphertext. What these tests
// exist for is the SAFETY property, because Rule 1 says a privacy feature may
// not widen the safety gap, and encryption is the one change in this codebase
// that could do it quietly:
//
//   * a locked entry still pages the specialist when the verdict is high
//   * a "safe" verdict cannot simply be asserted by a client
//   * an entry that arrived unscanned is VISIBLY unscanned — dead-lettered,
//     counted, and never resolved by a worker that mistakes "no plaintext"
//     for "nothing to worry about"
//   * the clinician loses default access to notes, not access to the trend
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  installRepos, installClassify, makeFakeRepos, buildApp, settle,
} = require('./helpers/harness.js');
const request = require('supertest');
const aiRouter = require('../src/routes/ai');
const journalRouter = require('../src/routes/journal');
const specialistRouter = require('../src/routes/specialist');
const worker = require('../src/workers/escalation');
const { signToken, signScanVerdict, hashText } = require('../src/utils/tokens');

const SLIDERS = { mood: 2, stress: 4, energy: 2, sleep: 2 };
const SAFE_TEXT = 'يوم عادي، تعبت شوية من الخدمة';
const CRISIS_TEXT = 'ما عاد نقدر نعيش، نموت خير';

let fake;
let app;
let patient;
let specialist;
let bearer;
let specBearer;

beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({
    '/api/ai': aiRouter, '/api/journal': journalRouter, '/api/specialist': specialistRouter,
  });
  specialist = fake.seed.user({ role: 'specialist', status: 'approved', name: 'Dr Amina' });
  patient = fake.seed.user({ role: 'patient', language: 'ar', assignedSpecialistId: specialist.id });
  bearer = `Bearer ${signToken(patient)}`;
  specBearer = `Bearer ${signToken(specialist)}`;
});
afterEach(() => { installClassify(null); });

const scan = (text) =>
  request(app).post('/api/journal/scan').set('Authorization', bearer).send({ text });
const checkin = (body) =>
  request(app).post('/api/ai/checkin').set('Authorization', bearer).send({ ...SLIDERS, ...body });
const entries = () => [...fake.state.journal.values()];
const alerts = () => [...fake.state.alerts.values()];

// A locked entry as the real client builds one: scan first, then encrypt.
const lockedBody = async (text, extra = {}) => {
  const res = await scan(text);
  return {
    ciphertext: `sealed(${Buffer.from(text).toString('base64')})`,
    nonce: 'nonce-1',
    keyVersion: 1,
    scan: { ...res.body.token, keyword: res.body.keyword, patternsVersion: 1 },
    ...extra,
  };
};

describe('the scan endpoint (layer 2 under encryption)', () => {
  it('classifies and returns a signed verdict without storing the text', async () => {
    installClassify(async () => ({ risk: 'none', confidence: 0.9, reason: 'ordinary day' }));
    const res = await scan(SAFE_TEXT);
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('none');
    expect(res.body.token.sig).toBeTruthy();
    // Nothing was written anywhere.
    expect(entries()).toHaveLength(0);
    expect(alerts()).toHaveLength(0);
  });

  it('binds the verdict to the text, so one safe token cannot be reused', async () => {
    installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' }));
    const safe = (await scan(SAFE_TEXT)).body.token;
    expect(safe.textHash).toBe(hashText(SAFE_TEXT));
    expect(safe.textHash).not.toBe(hashText(CRISIS_TEXT));
  });

  it('reports high on the keyword layer even when the classifier says otherwise', async () => {
    installClassify(async () => ({ risk: 'none', confidence: 0.9, reason: 'metaphor' }));
    const res = await scan(CRISIS_TEXT);
    expect(res.body.keyword).toBe(true);
    expect(res.body.verdict).toBe('high');
  });

  it('does not become a quiet "safe" when the classifier throws', async () => {
    installClassify(async () => { throw new Error('upstream down'); });
    const res = await scan(CRISIS_TEXT);
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('high');   // keyword layer still stands
    expect(res.body.llmLayer).toBe(false);   // ...and says the other one did not run
  });

  it('serves the pattern list so the device layer cannot drift from the server', async () => {
    const res = await request(app).get('/api/journal/scan-patterns').set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.version).toBeGreaterThan(0);
    expect(res.body.patterns).toContain('انتحار');
  });
});

describe('storing a locked entry', () => {
  beforeEach(() => installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' })));

  it('stores ciphertext and no plaintext', async () => {
    const res = await checkin(await lockedBody(SAFE_TEXT));
    expect(res.status).toBe(201);
    const [entry] = entries();
    expect(entry.note).toBeNull();
    expect(entry.ciphertext).toBeTruthy();
    expect(entry.scan.status).toBe('verified');
  });

  it('reports the recorded attestation back to the client, not a stale null', async () => {
    // The screener writes `scan` in a second statement, so the row returned by
    // the insert does not carry it. Sending that row unchanged told the client
    // `scan: null` — "never scanned" — for an entry that had just been
    // verified, which is the exact inversion this whole phase is about.
    const res = await checkin(await lockedBody(SAFE_TEXT));
    expect(res.body.entry.scan).toMatchObject({ status: 'verified', verdict: 'none' });
  });

  it('reports an unverified attestation back just as plainly', async () => {
    const res = await checkin({ ciphertext: 'sealed', nonce: 'n' });
    expect(res.body.entry.scan).toMatchObject({ status: 'unverified', reason: 'missing' });
  });

  it('keeps the sliders in the clear — they are the trend, not the confession', async () => {
    await checkin(await lockedBody(SAFE_TEXT));
    expect(entries()[0]).toMatchObject({ mood: 2, stress: 4, energy: 2, sleep: 2 });
  });

  it('refuses a body carrying both plaintext and ciphertext', async () => {
    const res = await checkin({ note: 'plain', ciphertext: 'sealed', nonce: 'n' });
    expect(res.status).toBe(400);
  });

  it('refuses ciphertext with no nonce', async () => {
    expect((await checkin({ ciphertext: 'sealed' })).status).toBe(400);
  });

  it('leaves the plaintext path exactly as it was', async () => {
    const res = await checkin({ note: SAFE_TEXT });
    expect(res.status).toBe(201);
    expect(entries()[0].note).toBe(SAFE_TEXT);
    expect(entries()[0].ciphertext).toBeNull();
  });
});

describe('the safety net still fires through the ciphertext', () => {
  it('pages the specialist on a high verdict, with no plaintext in the alert', async () => {
    installClassify(async () => ({ risk: 'high', confidence: 0.95, reason: 'active ideation' }));
    await checkin(await lockedBody(CRISIS_TEXT, {
      crisisEnvelope: { ciphertext: 'sealed-excerpt', nonce: 'n2', senderPublicKey: 'pk-patient' },
    }));
    await settle();

    expect(alerts()).toHaveLength(1);
    const [alert] = alerts();
    expect(alert.source).toBe('journal');
    expect(alert.specialistId).toBe(specialist.id);
    expect(alert.detail.encrypted).toBe(true);
    expect(alert.detail.crisisEnvelope).toBe(true);
    // The excerpt reaches the clinician sealed, never through the alert row.
    expect(JSON.stringify(alert)).not.toContain('نموت');
    expect(alert.detail.trigger).toBeUndefined();
  });

  it('still pages when the patient has no specialist and nothing to seal to', async () => {
    installClassify(async () => ({ risk: 'high', confidence: 0.9, reason: 'ideation' }));
    const solo = fake.seed.user({ role: 'patient' });
    const soloBearer = `Bearer ${signToken(solo)}`;
    const admin = fake.seed.user({ role: 'admin' });
    const token = signScanVerdict({ verdict: 'high', textHash: hashText(CRISIS_TEXT), userId: solo.id });

    const res = await request(app).post('/api/ai/checkin').set('Authorization', soloBearer)
      .send({ ...SLIDERS, ciphertext: 'sealed', nonce: 'n', scan: { ...token, keyword: true } });
    expect(res.status).toBe(201);
    await settle();

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].detail.crisisEnvelope).toBe(false);
    expect(admin.id).toBeTruthy();
  });

  it('a device-only keyword hit alerts even when the LLM verdict was none', async () => {
    installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' }));
    const token = signScanVerdict({ verdict: 'none', textHash: hashText(CRISIS_TEXT), userId: patient.id });
    await checkin({ ciphertext: 'sealed', nonce: 'n', scan: { ...token, keyword: true } });
    await settle();
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].detail.classifier).toBe('keyword-device');
  });
});

describe('an entry that arrived unscanned is visibly unscanned', () => {
  it('dead-letters a locked entry with no attestation at all', async () => {
    const res = await checkin({ ciphertext: 'sealed', nonce: 'n' });
    expect(res.status).toBe(201);              // the entry is still the patient's
    const [entry] = entries();
    expect(entry.scan).toMatchObject({ status: 'unverified', reason: 'missing' });
    expect([...fake.state.riskFailures.values()]).toHaveLength(1);
    expect(alerts()).toHaveLength(0);          // no verdict means no page, not a false one
  });

  it('refuses a forged verdict — a client cannot simply assert "safe"', async () => {
    const forged = {
      verdict: 'none', textHash: hashText(CRISIS_TEXT),
      exp: Math.floor(Date.now() / 1000) + 600, sig: 'not-a-real-signature',
    };
    await checkin({ ciphertext: 'sealed', nonce: 'n', scan: forged });
    expect(entries()[0].scan).toMatchObject({ status: 'unverified', reason: 'signature_invalid' });
    expect([...fake.state.riskFailures.values()]).toHaveLength(1);
  });

  it('refuses a verdict minted for a different account', async () => {
    const other = fake.seed.user({ role: 'patient' });
    const token = signScanVerdict({ verdict: 'none', textHash: hashText(SAFE_TEXT), userId: other.id });
    await checkin({ ciphertext: 'sealed', nonce: 'n', scan: token });
    expect(entries()[0].scan.reason).toBe('signature_invalid');
  });

  it('refuses an expired verdict', async () => {
    const token = signScanVerdict({ verdict: 'none', textHash: hashText(SAFE_TEXT), userId: patient.id });
    await checkin({ ciphertext: 'sealed', nonce: 'n', scan: { ...token, exp: 1 } });
    expect(entries()[0].scan.reason).toBe('signature_invalid');
  });

  it('the worker never resolves it — "no plaintext" is not "nothing to worry about"', async () => {
    await checkin({ ciphertext: 'sealed', nonce: 'n' });
    const [failure] = [...fake.state.riskFailures.values()];
    expect(failure.resolvedAt).toBeNull();

    await worker.sweepOnce(new Date());
    await settle();

    // Still open, still counted. This is the assertion the whole phase turns
    // on: the failure mode is a known gap, not a silent one.
    expect([...fake.state.riskFailures.values()][0].resolvedAt).toBeFalsy();
  });

  it('counts locked entries that never got a scan row at all', async () => {
    await fake.impl.insertJournalEntry({ userId: patient.id, ...SLIDERS, ciphertext: 'sealed', nonce: 'n' });
    expect(await fake.impl.countUnscannedEncryptedEntries()).toBe(1);
  });

  it('counts an UNVERIFIED attestation as unseen, not as scanned', async () => {
    // Writing scan = {status:'unverified'} makes the row non-NULL, so a
    // naive "WHERE scan IS NULL" reported zero unscanned entries while the
    // table held two. The metric whose entire job is to make a gap visible
    // was hiding it. Caught on live data, not here — hence this test.
    installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' }));
    await checkin({ ciphertext: 'sealed', nonce: 'n' });                       // missing
    await checkin({ ciphertext: 'sealed2', nonce: 'n', scan: { verdict: 'none', textHash: 'x', exp: 9e9, sig: 'bad' } });
    await checkin(await lockedBody(SAFE_TEXT));                                // genuinely verified

    expect(entries()).toHaveLength(3);
    expect(await fake.impl.countUnscannedEncryptedEntries()).toBe(2);
  });
});

describe('what the specialist can read', () => {
  beforeEach(() => installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' })));

  const specCheckins = () =>
    request(app).get(`/api/specialist/patients/${patient.id}/checkins`).set('Authorization', specBearer);

  it('reads a plaintext note as before', async () => {
    await checkin({ note: SAFE_TEXT });
    const [entry] = (await specCheckins()).body.entries;
    expect(entry).toMatchObject({ note: SAFE_TEXT, locked: false });
  });

  it('sees a locked entry marked, with the sliders intact and no ciphertext', async () => {
    await checkin(await lockedBody(SAFE_TEXT));
    const [entry] = (await specCheckins()).body.entries;
    expect(entry).toMatchObject({ locked: true, note: null, mood: 2, sleep: 2 });
    expect(entry.ciphertext).toBeUndefined();
    expect(entry.sharedEnvelope).toBeNull();
  });

  it('gets the envelope once the patient shares that one entry', async () => {
    await checkin(await lockedBody(SAFE_TEXT));
    const entryId = entries()[0].id;
    const shared = await request(app).post(`/api/journal/entries/${entryId}/share`)
      .set('Authorization', bearer)
      .send({ envelope: { ciphertext: 'sealed-for-amina', nonce: 'n3', senderPublicKey: 'pk-patient' } });
    expect(shared.status).toBe(201);

    const [entry] = (await specCheckins()).body.entries;
    expect(entry.sharedEnvelope.ciphertext).toBe('sealed-for-amina');
  });

  it('sharing is per entry — the next locked entry stays shut', async () => {
    await checkin(await lockedBody(SAFE_TEXT));
    const first = entries()[0].id;
    await request(app).post(`/api/journal/entries/${first}/share`).set('Authorization', bearer)
      .send({ envelope: { ciphertext: 'sealed-1', nonce: 'n', senderPublicKey: 'pk' } });
    await checkin(await lockedBody('سطر ثاني'));

    const list = (await specCheckins()).body.entries;
    expect(list.filter((e) => e.sharedEnvelope).length).toBe(1);
  });

  it('a revoked share stops opening the entry', async () => {
    await checkin(await lockedBody(SAFE_TEXT));
    const entryId = entries()[0].id;
    await request(app).post(`/api/journal/entries/${entryId}/share`).set('Authorization', bearer)
      .send({ envelope: { ciphertext: 'sealed', nonce: 'n', senderPublicKey: 'pk' } });
    await request(app).delete(`/api/journal/entries/${entryId}/share`).set('Authorization', bearer);

    expect((await specCheckins()).body.entries[0].sharedEnvelope).toBeNull();
  });

  it('cannot be handed another patient\'s entry to share', async () => {
    const other = fake.seed.user({ role: 'patient', assignedSpecialistId: specialist.id });
    const theirs = await fake.impl.insertJournalEntry({ userId: other.id, ...SLIDERS, ciphertext: 'x', nonce: 'n' });
    const res = await request(app).post(`/api/journal/entries/${theirs.id}/share`)
      .set('Authorization', bearer)
      .send({ envelope: { ciphertext: 'c', nonce: 'n', senderPublicKey: 'pk' } });
    expect(res.status).toBe(404);
    expect([...fake.state.journalShares.values()]).toHaveLength(0);
  });
});

describe('recovery — chosen, never defaulted', () => {
  const setRecovery = (body) =>
    request(app).put('/api/journal/recovery').set('Authorization', bearer).send(body);

  it('starts with nothing chosen', async () => {
    const res = await request(app).get('/api/journal/recovery').set('Authorization', bearer);
    expect(res.body.recovery).toBeNull();
  });

  it('stores a phrase-wrapped key the server cannot open', async () => {
    const res = await setRecovery({ method: 'phrase', wrappedKey: 'wrapped-by-phrase', keyVersion: 1 });
    expect(res.status).toBe(200);
    expect(fake.state.journalRecovery.get(patient.id)).toMatchObject({
      method: 'phrase', wrappedKey: 'wrapped-by-phrase',
    });
  });

  it('refuses phrase or escrow without a wrapped key — that would be a lock with no way back', async () => {
    expect((await setRecovery({ method: 'phrase' })).status).toBe(400);
    expect((await setRecovery({ method: 'escrow' })).status).toBe(400);
  });

  it('allows device-only, which is a real choice and never the default', async () => {
    expect((await setRecovery({ method: 'none' })).status).toBe(200);
  });

  it('rejects an invented method', async () => {
    expect((await setRecovery({ method: 'whatever', wrappedKey: 'k' })).status).toBe(400);
  });
});

describe('sharing keys', () => {
  it('a specialist publishes only the public half', async () => {
    const res = await request(app).put('/api/journal/keys')
      .set('Authorization', specBearer).send({ publicKey: 'x'.repeat(44) });
    expect(res.status).toBe(200);
    expect(fake.state.users.get(specialist.id).publicKey).toBe('x'.repeat(44));
  });

  it('a patient cannot publish a key as though they were the clinician', async () => {
    const res = await request(app).put('/api/journal/keys')
      .set('Authorization', bearer).send({ publicKey: 'x'.repeat(44) });
    expect(res.status).toBe(403);
  });

  it('hands the patient their own specialist\'s key, and nobody else\'s', async () => {
    await fake.impl.setUserPublicKey(specialist.id, 'k'.repeat(44));
    const res = await request(app).get('/api/journal/keys/specialist').set('Authorization', bearer);
    expect(res.body).toMatchObject({ specialistId: specialist.id, publicKey: 'k'.repeat(44) });
  });

  it('reports no key rather than inviting a share in the clear', async () => {
    const res = await request(app).get('/api/journal/keys/specialist').set('Authorization', bearer);
    expect(res.body.publicKey).toBeNull();
  });
});
