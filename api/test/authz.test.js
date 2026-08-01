// Phase 3.4.2 — the authorization matrix. One test per row: user B must not
// be able to read or mutate user A's resource. This is the suite that would
// have caught the Phase 0 voice-media leak (0.4) and push-token IDOR (0.5).
//
// Cast (built fresh per test):
//   patientA  — assigned to specialistA, in conversation convA
//   patientB  — assigned to specialistB, in conversation convB
//   specialistA / specialistB — approved
//   pendingSpecialist — registered but NOT approved
//   admin
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, installClassify, makeFakeRepos, buildApp } = require('./helpers/harness.js');
const request = require('supertest');
const { signToken } = require('../src/utils/tokens');

const routers = {
  '/api/conversations': require('../src/routes/conversations'),
  '/api/appointments': require('../src/routes/appointments'),
  '/api/specialist': require('../src/routes/specialist'),
  '/api/safety': require('../src/routes/safety'),
  '/api/questionnaires': require('../src/routes/questionnaires'),
  '/api/users': require('../src/routes/users'),
  '/api/ai': require('../src/routes/ai'),
  '/api/admin': require('../src/routes/admin'),
};

let fake;
let app;
let cast;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  installClassify(async () => ({ risk: 'none', confidence: 0.9, reason: 'benign' }));
  app = buildApp(routers);

  const specialistA = fake.seed.user({ role: 'specialist', status: 'approved', name: 'Spec A' });
  const specialistB = fake.seed.user({ role: 'specialist', status: 'approved', name: 'Spec B' });
  const pendingSpecialist = fake.seed.user({ role: 'specialist', status: 'pending', name: 'Pending' });
  const admin = fake.seed.user({ role: 'admin', name: 'Admin' });
  const patientA = fake.seed.user({ role: 'patient', assignedSpecialistId: specialistA.id, name: 'Patient A' });
  const patientB = fake.seed.user({ role: 'patient', assignedSpecialistId: specialistB.id, name: 'Patient B' });
  const convA = fake.seed.conversation(patientA, specialistA);
  const convB = fake.seed.conversation(patientB, specialistB);
  cast = { specialistA, specialistB, pendingSpecialist, admin, patientA, patientB, convA, convB };
});

const as = (user) => `Bearer ${signToken(user)}`;
const req = (method, path, user, body) => {
  const r = request(app)[method](path);
  if (user) r.set('Authorization', as(user));
  return body === undefined ? r : r.send(body);
};

describe('conversations + messages', () => {
  it('patient B cannot read patient A\'s thread', async () => {
    const res = await req('get', `/api/conversations/${cast.convA.id}/messages`, cast.patientB);
    expect(res.status).toBe(404);
  });

  it('specialist B cannot read patient A\'s thread', async () => {
    const res = await req('get', `/api/conversations/${cast.convA.id}/messages`, cast.specialistB);
    expect(res.status).toBe(404);
  });

  it('patient B cannot post into conversation A', async () => {
    const res = await req('post', `/api/conversations/${cast.convA.id}/messages`, cast.patientB, { text: 'hello' });
    expect(res.status).toBe(404);
    expect(await fake.impl.messagesOf(cast.convA.id)).toHaveLength(0);
  });

  it('members can read and post in their own conversation', async () => {
    expect((await req('post', `/api/conversations/${cast.convA.id}/messages`, cast.patientA, { text: 'hello' })).status).toBe(201);
    expect((await req('get', `/api/conversations/${cast.convA.id}/messages`, cast.specialistA)).status).toBe(200);
  });

  it('an unapproved specialist cannot post even in their own conversation', async () => {
    const conv = fake.seed.conversation(cast.patientA, cast.pendingSpecialist);
    const res = await req('post', `/api/conversations/${conv.id}/messages`, cast.pendingSpecialist, { text: 'hi' });
    expect(res.status).toBe(403);
  });

  it('no token = 401 everywhere', async () => {
    expect((await req('get', `/api/conversations/${cast.convA.id}/messages`, null)).status).toBe(401);
    expect((await req('get', '/api/ai/history', null)).status).toBe(401);
    expect((await req('get', '/api/safety/alerts', null)).status).toBe(401);
  });

  it('a deleted user\'s still-valid token is rejected', async () => {
    const ghost = { id: 'u_ghost', role: 'patient' };
    expect((await req('get', `/api/conversations/${cast.convA.id}/messages`, ghost)).status).toBe(401);
  });
});

describe('specialist patient data', () => {
  it('specialist B cannot read patient A\'s check-ins', async () => {
    const res = await req('get', `/api/specialist/patients/${cast.patientA.id}/checkins`, cast.specialistB);
    expect(res.status).toBe(404);
  });

  it('specialist B cannot toggle the AI companion for patient A', async () => {
    const res = await req('put', `/api/specialist/patients/${cast.patientA.id}/ai`, cast.specialistB, { enabled: false });
    expect(res.status).toBe(404);
    expect(cast.patientA.settings?.aiCompanion).toBeUndefined();
  });

  it('the assigned specialist can do both', async () => {
    expect((await req('get', `/api/specialist/patients/${cast.patientA.id}/checkins`, cast.specialistA)).status).toBe(200);
    expect((await req('put', `/api/specialist/patients/${cast.patientA.id}/ai`, cast.specialistA, { enabled: false })).status).toBe(200);
  });

  it('a patient cannot use the specialist API at all', async () => {
    expect((await req('get', '/api/specialist/patients', cast.patientA)).status).toBe(403);
  });

  it('an unapproved specialist cannot use the specialist API', async () => {
    expect((await req('get', '/api/specialist/patients', cast.pendingSpecialist)).status).toBe(403);
  });
});

describe('questionnaire history', () => {
  it('patient B cannot read patient A\'s history', async () => {
    const res = await req('get', `/api/questionnaires/history?patientId=${cast.patientA.id}`, cast.patientB);
    expect(res.status).toBe(403);
  });

  it('specialist B cannot read patient A\'s history', async () => {
    const res = await req('get', `/api/questionnaires/history?patientId=${cast.patientA.id}`, cast.specialistB);
    expect(res.status).toBe(403);
  });

  it('the assigned specialist and an admin can', async () => {
    expect((await req('get', `/api/questionnaires/history?patientId=${cast.patientA.id}`, cast.specialistA)).status).toBe(200);
    expect((await req('get', `/api/questionnaires/history?patientId=${cast.patientA.id}`, cast.admin)).status).toBe(200);
  });
});

describe('safety alerts', () => {
  let alertA;
  beforeEach(async () => {
    alertA = await fake.impl.insertSafetyAlert({
      patientId: cast.patientA.id, specialistId: cast.specialistA.id, source: 'chat', status: 'open',
    });
    await fake.impl.insertAlertEscalation({ alertId: alertA.id, tier: 0, notifiedId: cast.specialistA.id, method: 'page' });
  });

  it('specialist B does not see patient A\'s alert', async () => {
    const res = await req('get', '/api/safety/alerts', cast.specialistB);
    expect(res.body.alerts.map((a) => a.id)).not.toContain(alertA.id);
  });

  it('specialist B cannot acknowledge it', async () => {
    const res = await req('post', `/api/safety/alerts/${alertA.id}/ack`, cast.specialistB, { actionTaken: 'nothing really' });
    expect(res.status).toBe(403);
    expect((await fake.impl.findSafetyAlert(alertA.id)).status).toBe('open');
  });

  it('a patient cannot list alerts at all', async () => {
    expect((await req('get', '/api/safety/alerts', cast.patientA)).status).toBe(403);
  });

  it('a patient cannot acknowledge their own alert', async () => {
    const res = await req('post', `/api/safety/alerts/${alertA.id}/ack`, cast.patientA, { actionTaken: 'I am fine now' });
    expect(res.status).toBe(403);
  });

  it('only admins touch the critical list and the on-call rota', async () => {
    expect((await req('get', '/api/safety/alerts/critical', cast.specialistA)).status).toBe(403);
    expect((await req('get', '/api/safety/rota', cast.specialistA)).status).toBe(403);
    expect((await req('post', '/api/safety/rota', cast.specialistA, {
      specialistId: cast.specialistA.id, tier: 1,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(),
    })).status).toBe(403);
    expect((await req('get', '/api/safety/rota', cast.admin)).status).toBe(200);
  });
});

describe('appointments', () => {
  let appointment;
  beforeEach(() => {
    appointment = {
      id: 'apt_1', conversationId: cast.convA.id, patientId: cast.patientA.id,
      specialistId: cast.specialistA.id, proposedBy: cast.specialistA.id, status: 'proposed',
      scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
    };
    fake.impl.findAppointment = async (id) => (id === appointment.id ? appointment : null);
    fake.impl.updateAppointment = async (id, patch) => Object.assign(appointment, patch);
  });

  it('an outsider cannot respond to or cancel someone else\'s appointment', async () => {
    expect((await req('post', `/api/appointments/${appointment.id}/respond`, cast.patientB, { action: 'confirm' })).status).toBe(403);
    expect((await req('post', `/api/appointments/${appointment.id}/cancel`, cast.patientB)).status).toBe(403);
    expect(appointment.status).toBe('proposed');
  });

  it('the proposer cannot confirm their own proposal', async () => {
    const res = await req('post', `/api/appointments/${appointment.id}/respond`, cast.specialistA, { action: 'confirm' });
    expect(res.status).toBe(403);
  });

  it('the invitee can', async () => {
    const res = await req('post', `/api/appointments/${appointment.id}/respond`, cast.patientA, { action: 'confirm' });
    expect(res.status).toBe(200);
    expect(appointment.status).toBe('confirmed');
  });

  it('a non-member cannot propose into conversation A', async () => {
    const res = await req('post', '/api/appointments', cast.patientB, {
      conversationId: cast.convA.id, scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(res.status).toBe(404);
  });
});

describe('self-service endpoints stay self-scoped', () => {
  it('a patient cannot self-approve as a specialist or reassign themselves', async () => {
    const res = await req('put', '/api/users/me', cast.patientA, {
      name: 'X', role: 'admin', status: 'approved', assignedSpecialistId: cast.specialistB.id,
    });
    expect(res.status).toBe(400); // .strict() rejects unknown keys outright
    expect(cast.patientA.role).toBe('patient');
    expect(cast.patientA.assignedSpecialistId).toBe(cast.specialistA.id);
  });

  it('a patient cannot re-enable a companion their specialist switched off', async () => {
    await req('put', `/api/specialist/patients/${cast.patientA.id}/ai`, cast.specialistA, { enabled: false });
    expect(cast.patientA.settings.aiCompanion).toBe(false);

    const res = await req('put', '/api/users/me', cast.patientA, { settings: { aiCompanion: true } });
    expect(res.status).toBe(400);
    expect(cast.patientA.settings.aiCompanion).toBe(false);
    // ...and the companion still refuses to talk to them
    expect((await req('post', '/api/ai/chat', cast.patientA, { text: 'مرحبا' })).status).toBe(403);
  });

  it('a patient may still change their own name, language and notifications', async () => {
    const res = await req('put', '/api/users/me', cast.patientA, {
      name: 'اسم جديد', language: 'fr', settings: { notifications: false },
    });
    expect(res.status).toBe(200);
    expect(cast.patientA.language).toBe('fr');
    expect(cast.patientA.settings.notifications).toBe(false);
  });

  it('the AI companion API is patients-only', async () => {
    expect((await req('get', '/api/ai/history', cast.specialistA)).status).toBe(403);
    expect((await req('post', '/api/ai/chat', cast.specialistA, { text: 'hi' })).status).toBe(403);
  });

  it('the admin API is admins-only', async () => {
    expect((await req('get', '/api/admin/stats', cast.specialistA)).status).toBe(403);
    expect((await req('get', '/api/admin/users', cast.patientA)).status).toBe(403);
    expect((await req('get', '/api/admin/stats', cast.admin)).status).toBe(200);
  });
});
