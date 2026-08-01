// Phase 0.1 — the Google endpoint must never mint a session from an
// unverified request body. GOOGLE_CLIENT_ID is set (test/setup-env.js) and
// MOCK_GOOGLE_AUTH is off, so this is the production code path.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const authRouter = require('../src/routes/auth');

let fake;
let app;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/auth': authRouter });
});

describe('POST /api/auth/google with verification on (0.1)', () => {
  it('rejects a forged { email } body with 401 — the old bypass', async () => {
    fake.seed.user({ role: 'admin', email: 'admin@kalimni.app' });
    const res = await request(app).post('/api/auth/google').send({ email: 'admin@kalimni.app' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a forged { email, name } for a new account', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ email: 'attacker@evil.dz', name: 'X' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(await fake.impl.findUserByEmail('attacker@evil.dz')).toBeNull();
  });

  it('rejects a malformed idToken with 401', async () => {
    const res = await request(app).post('/api/auth/google').send({ idToken: 'not-a-jwt' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('email/password login still works', async () => {
    const bcrypt = require('bcryptjs');
    fake.seed.user({ email: 'p@t.dz', passwordHash: bcrypt.hashSync('password123', 4) });
    const res = await request(app).post('/api/auth/login').send({ email: 'p@t.dz', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('login rejects a wrong password', async () => {
    const bcrypt = require('bcryptjs');
    fake.seed.user({ email: 'p@t.dz', passwordHash: bcrypt.hashSync('password123', 4) });
    const res = await request(app).post('/api/auth/login').send({ email: 'p@t.dz', password: 'nope' });
    expect(res.status).toBe(401);
  });
});
