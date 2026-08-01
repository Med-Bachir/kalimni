// Phase 0.5 — push-token routes are owner-scoped. A token string in the wrong
// hands must not silence another user's safety-alert pages.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const usersRouter = require('../src/routes/users');
const { signToken } = require('../src/utils/tokens');

const TOKEN = 'ExponentPushToken[victim-device-token]';

let fake;
let app;
let victim;
let attacker;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/users': usersRouter });
  victim = fake.seed.user({ role: 'specialist', status: 'approved' });
  attacker = fake.seed.user({ role: 'patient' });
  fake.state.pushTokens.set(TOKEN, { token: TOKEN, userId: victim.id, platform: 'android' });
});

const asUser = (u) => `Bearer ${signToken(u)}`;

describe('push-token ownership (0.5)', () => {
  it('another account cannot delete the victim\'s token', async () => {
    const res = await request(app)
      .delete('/api/users/me/push-token')
      .set('Authorization', asUser(attacker))
      .send({ token: TOKEN });
    expect(res.status).toBe(200); // route answers ok, but deletes nothing
    expect(fake.state.pushTokens.get(TOKEN).userId).toBe(victim.id);
  });

  it('another account cannot re-parent the victim\'s token (409)', async () => {
    const res = await request(app)
      .post('/api/users/me/push-token')
      .set('Authorization', asUser(attacker))
      .send({ token: TOKEN, platform: 'android' });
    expect(res.status).toBe(409);
    expect(fake.state.pushTokens.get(TOKEN).userId).toBe(victim.id);
  });

  it('the owner still refreshes their own registration', async () => {
    const res = await request(app)
      .post('/api/users/me/push-token')
      .set('Authorization', asUser(victim))
      .send({ token: TOKEN, platform: 'ios' });
    expect(res.status).toBe(200);
    expect(fake.state.pushTokens.get(TOKEN).platform).toBe('ios');
  });

  it('the owner deletes their token on logout', async () => {
    const res = await request(app)
      .delete('/api/users/me/push-token')
      .set('Authorization', asUser(victim))
      .send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(fake.state.pushTokens.has(TOKEN)).toBe(false);
  });

  it('a fresh token registers normally', async () => {
    const res = await request(app)
      .post('/api/users/me/push-token')
      .set('Authorization', asUser(attacker))
      .send({ token: 'ExponentPushToken[new-device]' });
    expect(res.status).toBe(200);
    expect(fake.state.pushTokens.get('ExponentPushToken[new-device]').userId).toBe(attacker.id);
  });
});
