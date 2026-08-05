// Phase 2.3 — Session Witness.
//
// The brief is a consent mechanism that happens to render as a screen. What
// these tests hold down is the consent, not the layout:
//   * nothing the machine wrote ships without an affirmative tick
//   * unticking DELETES, so a brief cannot be un-shared later by reading the
//     row it came from
//   * a safety alert is never something a patient can un-send, and the copy
//     does not pretend otherwise
//   * a draft is never visible to the specialist, and neither is another
//     patient's anything
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installRepos, makeFakeRepos, buildApp, settle } = require('./helpers/harness.js');
const request = require('supertest');
const witnessRouter = require('../src/routes/witness');
const specialistRouter = require('../src/routes/specialist');
const { signToken } = require('../src/utils/tokens');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

let fake;
let app;
let patient;
let specialist;
let bearer;
let specBearer;

beforeEach(() => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/witness': witnessRouter, '/api/specialist': specialistRouter });
  specialist = fake.seed.user({ role: 'specialist', status: 'approved', name: 'Dr Amina' });
  patient = fake.seed.user({ role: 'patient', language: 'ar', name: 'كريم', assignedSpecialistId: specialist.id });
  bearer = `Bearer ${signToken(patient)}`;
  specBearer = `Bearer ${signToken(specialist)}`;
});
afterEach(() => settle());

const draft = () => request(app).get('/api/witness/draft').set('Authorization', bearer);
const save = (body) => request(app).put('/api/witness/draft').set('Authorization', bearer).send(body);
const share = () => request(app).post('/api/witness/draft/share').set('Authorization', bearer);
const specBriefs = () =>
  request(app).get(`/api/specialist/patients/${patient.id}/briefs`).set('Authorization', specBearer);

const seedCheckins = async (n = 5) => {
  for (let i = 0; i < n; i += 1) {
    const entry = await fake.impl.insertJournalEntry({
      userId: patient.id, mood: 2, stress: 4, energy: 2, sleep: 2,
    });
    entry.createdAt = daysAgo(i + 1);
  }
};

const seedCompanion = async ({ summary, topics, suggestions } = {}) => {
  const conv = await fake.impl.getOrCreateAiConversation(patient.id);
  if (summary || topics) await fake.impl.upsertAiState(conv.id, { summary, topics });
  if (suggestions) {
    const m = await fake.impl.insertAiMessage({
      conversationId: conv.id, role: 'assistant', text: 'حسناً', suggestions,
    });
    m.createdAt = daysAgo(1);
  }
  return conv;
};

const itemsOf = (body) => body.brief.items;
const item = (body, id) => itemsOf(body).find((i) => i.id === id);

describe('building the draft', () => {
  it('assembles check-ins, themes and exercises from stored data', async () => {
    await seedCheckins(6);
    await seedCompanion({
      summary: 'يعيش وحده في وهران. ساعده تمرين التنفس.',
      topics: ['sleep'],
      suggestions: [{ kind: 'exercise', key: 'breathing478', title: { ar: 'تمرين التنفس', fr: 'Respiration' } }],
    });

    const res = await draft();
    expect(res.status).toBe(200);
    expect(itemsOf(res.body).map((i) => i.id)).toEqual(['notes', 'checkins', 'themes', 'exercises']);
    expect(item(res.body, 'checkins').body).toContain('6');
    expect(item(res.body, 'themes').body).toContain('وهران');
    expect(item(res.body, 'themes').fromMemory).toBe(true);
    expect(item(res.body, 'exercises').body).toContain('تمرين التنفس');
  });

  it('defaults every GENERATED item to off, and the patient\'s own words to on', async () => {
    await seedCheckins(3);
    await seedCompanion({ summary: 'ملخص.', topics: [] });
    const res = await draft();
    expect(item(res.body, 'checkins').included).toBe(false);
    expect(item(res.body, 'themes').included).toBe(false);
    expect(item(res.body, 'notes').included).toBe(true);
  });

  it('omits sections it has no data for rather than showing empty ones', async () => {
    const res = await draft();
    expect(itemsOf(res.body).map((i) => i.id)).toEqual(['notes']);
  });

  it('ignores anything older than the window', async () => {
    const entry = await fake.impl.insertJournalEntry({ userId: patient.id, mood: 3, stress: 3, energy: 3, sleep: 3 });
    entry.createdAt = daysAgo(30);
    const res = await draft();
    expect(item(res.body, 'checkins')).toBeUndefined();
  });

  it('refreshes generated bodies on every read while keeping notes and ticks', async () => {
    await seedCheckins(2);
    await draft();
    await save({ notes: ['أريد الحديث عن نومي'], includedIds: ['notes', 'checkins'] });

    await seedCheckins(4); // more data arrives before the session
    const res = await draft();
    expect(item(res.body, 'notes').body).toBe('أريد الحديث عن نومي');
    expect(item(res.body, 'checkins').included).toBe(true);
    expect(item(res.body, 'checkins').body).toContain('6');
  });

  it('is refused for a patient with no assigned specialist', async () => {
    const solo = fake.seed.user({ role: 'patient' });
    const res = await request(app).get('/api/witness/draft')
      .set('Authorization', `Bearer ${signToken(solo)}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('no_specialist');
  });

  it('keeps exactly one draft per patient', async () => {
    await draft();
    await draft();
    await draft();
    expect(fake.state.briefs.size).toBe(1);
  });
});

describe('sharing it', () => {
  beforeEach(async () => {
    await seedCheckins(4);
    await seedCompanion({ summary: 'يعيش وحده في وهران.', topics: ['family'] });
    await draft();
  });

  it('sends only the ticked items — and DELETES the rest from the row', async () => {
    await save({ notes: ['أريد الحديث عن نومي'], includedIds: ['notes', 'checkins'] });
    const res = await share();
    expect(res.status).toBe(200);

    const ids = res.body.brief.items.map((i) => i.id);
    expect(ids).toEqual(['notes', 'checkins']);
    // The unshared theme is gone from storage, not merely filtered on read.
    expect(JSON.stringify([...fake.state.briefs.values()])).not.toContain('وهران');
  });

  it('an untouched draft shares only the patient\'s notes, never the generated items', async () => {
    await save({ notes: ['نمت بشكل سيء'] });
    const res = await share();
    expect(res.body.brief.items.map((i) => i.id)).toEqual(['notes']);
  });

  it('refuses to send an empty brief', async () => {
    const res = await share();     // no notes typed, nothing ticked
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('nothing_selected');
    expect(fake.state.briefs.size).toBe(1);   // still a draft, nothing sent
  });

  it('once shared there is no draft left to send again', async () => {
    await save({ notes: ['ملاحظة'] });
    await share();
    const again = await share();
    expect(again.status).toBe(404);
  });

  it('a discarded draft leaves no trace', async () => {
    await save({ notes: ['شيء لن أرسله'] });
    const res = await request(app).delete('/api/witness/draft').set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(fake.state.briefs.size).toBe(0);
  });
});

describe('the safety item', () => {
  beforeEach(async () => {
    const alert = await fake.impl.insertSafetyAlert({
      patientId: patient.id, specialistId: specialist.id, source: 'ai_chat', status: 'open',
      detail: { risk: 'high', hold: true },
    });
    alert.createdAt = daysAgo(2);
  });

  it('is locked and pre-included', async () => {
    const res = await draft();
    expect(item(res.body, 'safety')).toMatchObject({ locked: true, included: true });
  });

  it('says plainly that the specialist sees it either way', async () => {
    const res = await draft();
    expect(item(res.body, 'safety').body).toContain('مختصك يراها أصلاً');
  });

  it('cannot be unticked — not by the UI, and not by a hand-made request', async () => {
    await save({ includedIds: [] });          // "untick everything"
    const after = await draft();
    expect(item(after.body, 'safety').included).toBe(true);

    await save({ notes: ['ملاحظة'], includedIds: ['notes'] });
    const res = await share();
    expect(res.body.brief.items.map((i) => i.id)).toContain('safety');
  });
});

describe('the after-session takeaway', () => {
  const takeaway = (id, text) =>
    request(app).post(`/api/witness/briefs/${id}/takeaway`).set('Authorization', bearer).send({ text });

  it('attaches to the brief and carries into the next one, patient-authored', async () => {
    await draft();
    await save({ notes: ['ملاحظة'] });
    const shared = (await share()).body.brief;

    const res = await takeaway(shared.id, 'أن أطلب المساعدة أبكر');
    expect(res.status).toBe(200);
    expect(res.body.brief.takeaway).toBe('أن أطلب المساعدة أبكر');

    const next = await draft();
    expect(item(next.body, 'takeaway')).toMatchObject({
      body: 'أن أطلب المساعدة أبكر', patientAuthored: true, included: true,
    });
  });

  it('cannot be written onto someone else\'s brief', async () => {
    const other = fake.seed.user({ role: 'patient', assignedSpecialistId: specialist.id });
    const theirs = await fake.impl.insertSessionBrief({
      patientId: other.id, specialistId: specialist.id, items: [],
    });
    const res = await takeaway(theirs.id, 'محاولة');
    expect(res.status).toBe(404);
    expect(fake.state.briefs.get(theirs.id).takeaway).toBeNull();
  });
});

describe('what the specialist can read', () => {
  it('sees shared briefs, and never a draft', async () => {
    await seedCheckins(3);
    await draft();
    await save({ notes: ['سؤال مهم'], includedIds: ['notes'] });

    expect((await specBriefs()).body.briefs).toEqual([]);   // still a draft

    await share();
    const res = await specBriefs();
    expect(res.body.briefs).toHaveLength(1);
    expect(res.body.briefs[0].items[0].body).toBe('سؤال مهم');
  });

  it('cannot read a brief belonging to a patient who is not theirs', async () => {
    const otherSpecialist = fake.seed.user({ role: 'specialist', status: 'approved' });
    await draft();
    await save({ notes: ['خاص'] });
    await share();

    const res = await request(app).get(`/api/specialist/patients/${patient.id}/briefs`)
      .set('Authorization', `Bearer ${signToken(otherSpecialist)}`);
    expect(res.status).toBe(404);
  });

  it('a patient cannot call the specialist route at all', async () => {
    const res = await request(app).get(`/api/specialist/patients/${patient.id}/briefs`)
      .set('Authorization', bearer);
    expect(res.status).toBe(403);
  });

  it('an unapproved specialist is refused even for their own patient', async () => {
    const pending = fake.seed.user({ role: 'specialist', status: 'pending' });
    patient.assignedSpecialistId = pending.id;
    const res = await request(app).get(`/api/specialist/patients/${patient.id}/briefs`)
      .set('Authorization', `Bearer ${signToken(pending)}`);
    expect(res.status).toBe(403);
  });
});

describe('input handling', () => {
  it('caps notes at three lines and rejects unknown keys', async () => {
    await draft();
    const tooMany = await save({ notes: ['a', 'b', 'c', 'd'] });
    expect(tooMany.status).toBe(400);

    const smuggled = await request(app).put('/api/witness/draft')
      .set('Authorization', bearer).send({ notes: ['a'], status: 'shared' });
    expect(smuggled.status).toBe(400);
  });

  it('a save without includedIds leaves the ticks alone', async () => {
    await seedCheckins(2);
    await draft();
    await save({ includedIds: ['notes', 'checkins'] });
    await save({ notes: ['فقط أكتب'] });                  // typing, not ticking
    const res = await draft();
    expect(item(res.body, 'checkins').included).toBe(true);
  });
});
