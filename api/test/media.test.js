// Phase 0.4 — voice files require identity + ownership. Done-when: patient B
// requesting patient A's file gets 403, and a deleted user's token gets 401.
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');
const { installRepos, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const mediaRouter = require('../src/routes/media');
const { signToken } = require('../src/utils/tokens');
const { VOICE_DIR } = require('../src/utils/mediaStore');

const FILE = 'vm_test_media.m4a';

beforeAll(() => fs.writeFileSync(path.join(VOICE_DIR, FILE), 'FAKE-AUDIO-BYTES'));
afterAll(() => fs.rmSync(path.join(VOICE_DIR, FILE), { force: true }));

let fake;
let app;
let patientA;
let patientB;
let specialist;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/media': mediaRouter });
  patientA = fake.seed.user({ role: 'patient' });
  patientB = fake.seed.user({ role: 'patient' });
  specialist = fake.seed.user({ role: 'specialist', status: 'approved' });
  const conv = fake.seed.conversation(patientA, specialist);
  fake.seed.voiceMessage(conv, patientA, FILE);
});

const asUser = (u) => `Bearer ${signToken(u)}`;

describe('GET /api/media/voice/:file (0.4)', () => {
  it('the sender streams their own file', async () => {
    const res = await request(app).get(`/api/media/voice/${FILE}`).set('Authorization', asUser(patientA));
    expect(res.status).toBe(200);
  });

  it('the conversation partner (specialist) streams it too', async () => {
    const res = await request(app).get(`/api/media/voice/${FILE}`).set('Authorization', asUser(specialist));
    expect(res.status).toBe(200);
  });

  it('another authenticated patient gets 403 — the old cross-patient leak', async () => {
    const res = await request(app).get(`/api/media/voice/${FILE}`).set('Authorization', asUser(patientB));
    expect(res.status).toBe(403);
  });

  it('a deleted user\'s still-valid token gets 401', async () => {
    const ghost = { id: 'u_deleted_ghost', role: 'patient' }; // signed but not in the DB
    const res = await request(app).get(`/api/media/voice/${FILE}`).set('Authorization', asUser(ghost));
    expect(res.status).toBe(401);
  });

  it('no credentials -> 401; unknown file -> 404', async () => {
    expect((await request(app).get(`/api/media/voice/${FILE}`)).status).toBe(401);
    expect(
      (await request(app).get('/api/media/voice/vm_nope.m4a').set('Authorization', asUser(patientA))).status
    ).toBe(404);
  });

  it('the legacy ?token= credential no longer works', async () => {
    const res = await request(app).get(`/api/media/voice/${FILE}?token=${signToken(patientA)}`);
    expect(res.status).toBe(401);
  });
});

describe('signed playback URLs (0.4)', () => {
  it('mints a URL for a member, and the URL streams without headers', async () => {
    const mint = await request(app)
      .post(`/api/media/voice/${FILE}/url`)
      .set('Authorization', asUser(patientA));
    expect(mint.status).toBe(200);
    expect(mint.body.url).toMatch(/^\/api\/media\/voice\//);

    const res = await request(app).get(mint.body.url);
    expect(res.status).toBe(200);
  });

  it('refuses to mint for a non-member', async () => {
    const res = await request(app)
      .post(`/api/media/voice/${FILE}/url`)
      .set('Authorization', asUser(patientB));
    expect(res.status).toBe(403);
  });

  it('a tampered signed URL (someone else\'s uid) is rejected', async () => {
    const mint = await request(app)
      .post(`/api/media/voice/${FILE}/url`)
      .set('Authorization', asUser(patientA));
    const tampered = mint.body.url.replace(
      `uid=${encodeURIComponent(patientA.id)}`,
      `uid=${encodeURIComponent(patientB.id)}`
    );
    expect(tampered).not.toBe(mint.body.url);
    const res = await request(app).get(tampered);
    expect(res.status).toBe(401);
  });

  it('a tampered expiry is rejected', async () => {
    const mint = await request(app)
      .post(`/api/media/voice/${FILE}/url`)
      .set('Authorization', asUser(patientA));
    const res = await request(app).get(mint.body.url.replace(/exp=\d+/, 'exp=9999999999'));
    expect(res.status).toBe(401);
  });

  it('a signed URL dies with the account', async () => {
    const mint = await request(app)
      .post(`/api/media/voice/${FILE}/url`)
      .set('Authorization', asUser(patientA));
    fake.state.users.delete(patientA.id);
    const res = await request(app).get(mint.body.url);
    expect(res.status).toBe(401);
  });
});
