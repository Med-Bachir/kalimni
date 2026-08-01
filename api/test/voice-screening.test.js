// Phase 0.6 — voice messages are risk-screened via transcription, voice is
// unavailable during an open alert, and transcripts reach ONLY the specialist.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');
const {
  installRepos, installTranscription, makeFakeRepos, buildApp, settle,
} = require('./helpers/harness.js');
const request = require('supertest');
const conversationsRouter = require('../src/routes/conversations');
const voiceScreening = require('../src/services/voiceScreeningService');
const { signToken } = require('../src/utils/tokens');
const { VOICE_DIR } = require('../src/utils/mediaStore');

const CRISIS_TRANSCRIPT = 'نموت خير من هاد الحياة'; // keyword-layer hit
const BENIGN_TRANSCRIPT = 'اليوم كان يوم عادي، شكراً';

let fake;
let app;
let patient;
let specialist;
let conv;
beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  installTranscription(null); // default back to the real (unconfigured) service
  app = buildApp({ '/api/conversations': conversationsRouter });
  patient = fake.seed.user({ role: 'patient' });
  specialist = fake.seed.user({ role: 'specialist', status: 'approved' });
  conv = fake.seed.conversation(patient, specialist);
});

const asUser = (u) => `Bearer ${signToken(u)}`;
const sendVoice = (user) =>
  request(app)
    .post(`/api/conversations/${conv.id}/voice`)
    .set('Authorization', asUser(user))
    .field('durationMs', '1500')
    .attach('audio', Buffer.from('FAKE-AUDIO'), { filename: 'voice.m4a', contentType: 'audio/m4a' });

const cleanupUploads = () => {
  for (const m of fake.state.messages.values()) {
    if (m.audioUrl) fs.rmSync(path.join(VOICE_DIR, path.basename(m.audioUrl)), { force: true });
  }
};

describe('voice during an open safety alert (0.6 step 1)', () => {
  it('is refused with 403 while any alert is open', async () => {
    await fake.impl.insertSafetyAlert({ patientId: patient.id, source: 'chat', status: 'open' });
    const res = await sendVoice(patient);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('voice_unavailable_during_alert');
  });

  it('is allowed again once the alert is acknowledged', async () => {
    const alert = await fake.impl.insertSafetyAlert({ patientId: patient.id, source: 'chat', status: 'open' });
    await fake.impl.updateSafetyAlert(alert.id, { status: 'acknowledged' });
    const res = await sendVoice(patient);
    expect(res.status).toBe(201);
    await settle();
    cleanupUploads();
  });
});

describe('transcription screening (0.6 step 2)', () => {
  it('a crisis voice note is transcribed, flagged, and opens an alert', async () => {
    installTranscription({ isConfigured: () => true, transcribeFile: async () => CRISIS_TRANSCRIPT });

    const res = await sendVoice(patient);
    expect(res.status).toBe(201);
    await settle();

    const message = fake.state.messages.get(res.body.message.id);
    expect(message.riskFlag).toBe(true);
    const alerts = [...fake.state.alerts.values()];
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toBe('chat');
    expect(alerts[0].detail.viaVoice).toBe(true);
    expect(fake.state.transcripts.get(message.id).status).toBe('done');
    cleanupUploads();
  });

  it('a benign voice note stores its transcript and raises nothing', async () => {
    installTranscription({ isConfigured: () => true, transcribeFile: async () => BENIGN_TRANSCRIPT });

    const res = await sendVoice(patient);
    await settle();

    const message = fake.state.messages.get(res.body.message.id);
    expect(message.riskFlag).toBe(false);
    expect([...fake.state.alerts.values()]).toHaveLength(0);
    expect(fake.state.transcripts.get(message.id).text).toBe(BENIGN_TRANSCRIPT);
    cleanupUploads();
  });

  it('with no provider configured the note is recorded as unavailable — visibly unscreened', async () => {
    const res = await sendVoice(patient);
    await settle();
    expect(fake.state.transcripts.get(res.body.message.id).status).toBe('unavailable');
    cleanupUploads();
  });

  it('a provider failure is recorded as failed, and chat did not break', async () => {
    installTranscription({
      isConfigured: () => true,
      transcribeFile: async () => { throw new Error('provider down'); },
    });
    const res = await sendVoice(patient);
    expect(res.status).toBe(201);
    await settle();
    expect(fake.state.transcripts.get(res.body.message.id).status).toBe('failed');
    cleanupUploads();
  });

  it('the specialist\'s own voice notes are not screened', async () => {
    installTranscription({ isConfigured: () => true, transcribeFile: async () => CRISIS_TRANSCRIPT });
    const res = await sendVoice(specialist);
    expect(res.status).toBe(201);
    await settle();
    expect(fake.state.transcripts.has(res.body.message.id)).toBe(false);
    expect([...fake.state.alerts.values()]).toHaveLength(0);
    cleanupUploads();
  });
});

describe('transcript visibility (0.6)', () => {
  it('reaches the specialist, never the patient', async () => {
    const message = fake.seed.voiceMessage(conv, patient, 'vm_seen.m4a');
    await fake.impl.saveVoiceTranscript({ messageId: message.id, text: CRISIS_TRANSCRIPT, status: 'done' });

    const forSpecialist = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .set('Authorization', asUser(specialist));
    const specialistRow = forSpecialist.body.messages.find((m) => m.id === message.id);
    expect(specialistRow.transcript).toEqual({ text: CRISIS_TRANSCRIPT, status: 'done' });

    const forPatient = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .set('Authorization', asUser(patient));
    const patientRow = forPatient.body.messages.find((m) => m.id === message.id);
    expect(patientRow.transcript).toBeUndefined();
  });

  it('an unscreened voice note is marked unavailable for the specialist', async () => {
    fake.seed.voiceMessage(conv, patient, 'vm_old.m4a'); // pre-dates screening: no transcript row
    const res = await request(app)
      .get(`/api/conversations/${conv.id}/messages`)
      .set('Authorization', asUser(specialist));
    const row = res.body.messages.find((m) => m.audioUrl);
    expect(row.transcript).toEqual({ text: null, status: 'unavailable' });
  });
});
