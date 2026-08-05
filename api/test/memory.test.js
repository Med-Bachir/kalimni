// Phase 2.4 — the companion's memory is the patient's.
//
// The load-bearing property is not "the patient can edit a text field". It is
// that a FORGET SURVIVES THE NEXT REFRESH: the summariser re-reads the same
// transcript every 8 exchanges, so without enforcement the deleted line comes
// straight back and the promise made to the patient was a lie. Most of what
// follows tests that one thing from several angles.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  installRepos, installChatJson, installClassify, makeFakeRepos, buildApp, settle,
} = require('./helpers/harness.js');
const request = require('supertest');
const aiRouter = require('../src/routes/ai');
const memory = require('../src/services/memoryService');
const { signToken } = require('../src/utils/tokens');

const SUMMARY_AR =
  'يعيش وحده في وهران منذ سنة. يتشاجر كثيراً مع أخيه ولم يكلمه منذ شهرين. ساعده تمرين التنفس قبل النوم.';

let fake;
let app;
let patient;
let bearer;
let conversationId;

beforeEach(async () => {
  fake = makeFakeRepos();
  installRepos(fake.impl);
  app = buildApp({ '/api/ai': aiRouter });
  patient = fake.seed.user({ role: 'patient', language: 'ar' });
  bearer = `Bearer ${signToken(patient)}`;
  const conv = await fake.impl.getOrCreateAiConversation(patient.id);
  conversationId = conv.id;
  await fake.impl.upsertAiState(conversationId, {
    summary: SUMMARY_AR, topics: ['sleep', 'family'], emotion: 'sadness', followUp: 'كيف كانت ليلتك؟',
  });
});
afterEach(() => {
  installChatJson(null);
  installClassify(null);
});

const get = () => request(app).get('/api/ai/memory').set('Authorization', bearer);
const put = (text) => request(app).put('/api/ai/memory').set('Authorization', bearer).send({ text });
const forget = (id) => request(app).delete(`/api/ai/memory/lines/${id}`).set('Authorization', bearer);
const forgetAll = () => request(app).delete('/api/ai/memory').set('Authorization', bearer);
const stateNow = () => fake.state.aiStates.get(conversationId);

describe('reading the memory', () => {
  it('returns the summary split into individually addressable lines', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.lines).toHaveLength(3);
    expect(res.body.lines[1].text).toContain('أخيه');
    expect(res.body.lines.every((l) => l.id.startsWith('ln_'))).toBe(true);
    expect(res.body.topics).toEqual(['sleep', 'family']);
  });

  it('line ids are content-derived, so they survive re-ordering', async () => {
    const before = (await get()).body.lines;
    // Same three sentences, different order — a refresh can do this.
    await fake.impl.upsertAiState(conversationId, {
      summary: [before[2].text, before[0].text, before[1].text].join(' '),
    });
    const after = (await get()).body.lines;
    expect(after.map((l) => l.id).sort()).toEqual(before.map((l) => l.id).sort());
  });

  it('never returns the forget list itself, only how many things are in it', async () => {
    const lines = (await get()).body.lines;
    await forget(lines[1].id);
    const res = await get();
    expect(res.body.forgottenCount).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('أخيه');
  });

  it('a patient who never opened the companion gets an empty memory, not a thread', async () => {
    const fresh = fake.seed.user({ role: 'patient' });
    const res = await request(app).get('/api/ai/memory')
      .set('Authorization', `Bearer ${signToken(fresh)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ exists: false, lines: [] });
    expect(fake.state.aiConversations.has(fresh.id)).toBe(false);
  });

  it('is readable even when the specialist switched the companion off', async () => {
    patient.settings = { ...patient.settings, aiCompanion: false };
    expect((await get()).status).toBe(200);
    expect((await forgetAll()).status).toBe(200);
    // ...while chatting stays blocked.
    const chat = await request(app).post('/api/ai/chat')
      .set('Authorization', bearer).send({ text: 'مرحبا' });
    expect(chat.status).toBe(403);
  });
});

describe('correcting the memory', () => {
  it('stores the patient text verbatim and marks it as theirs', async () => {
    const res = await put('أعيش وحدي، وأنا مرتاح لذلك. علاقتي بأخي تتحسن.');
    expect(res.status).toBe(200);
    expect(stateNow().summary).toBe('أعيش وحدي، وأنا مرتاح لذلك. علاقتي بأخي تتحسن.');
    expect(stateNow().editedAt).toBeTruthy();
  });

  it('takes effect on the very next turn (the prompt reads this row)', async () => {
    await put('أنا طالب طب في الجزائر العاصمة.');
    const seen = [];
    installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' }));
    installChatJson(async (messages) => {
      seen.push(messages.find((m) => m.role === 'system').content);
      return { reply: 'مرحباً بك.', emotion: 'neutral', exerciseKey: null };
    });
    await request(app).post('/api/ai/chat').set('Authorization', bearer).send({ text: 'مرحبا' });
    expect(seen[0]).toContain('أنا طالب طب في الجزائر العاصمة.');
    expect(seen[0]).not.toContain('وهران');
  });

  it('a correction does NOT become a filter that would delete the correction', async () => {
    // The trap: treating "rewrite" as "forget the old + add the new" installs
    // a token bag that the new, near-identical wording then matches.
    const lines = (await get()).body.lines;
    const original = lines[1].text;                      // "...لم يكلمه منذ شهرين"
    await put(`${lines[0].text} علاقته بأخيه تتحسن ببطء. ${lines[2].text}`);
    expect(stateNow().forgotten).toEqual([]);
    expect(memory.applyForgotten(original, stateNow().forgotten)).toBe(original);
  });

  it('accepts an empty memory — "you remember nothing about me" is a valid answer', async () => {
    const res = await put('');
    expect(res.status).toBe(200);
    expect(res.body.lines).toEqual([]);
    expect(stateNow().summary).toBe('');
  });

  it('rejects unknown keys and over-long text', async () => {
    const smuggled = await request(app).put('/api/ai/memory')
      .set('Authorization', bearer).send({ text: 'ok', forgotten: [] });
    expect(smuggled.status).toBe(400);
    const long = await put('ا'.repeat(1600));
    expect(long.status).toBe(400);
  });
});

describe('forgetting a line', () => {
  it('removes it and leaves the rest of the memory intact', async () => {
    const lines = (await get()).body.lines;
    const res = await forget(lines[1].id);
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(2);
    expect(stateNow().summary).not.toContain('أخيه');
    expect(stateNow().summary).toContain('وهران');
  });

  it('404s on an id that is not in the memory', async () => {
    const res = await forget('ln_nothing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('line_not_found');
  });

  it('SURVIVES the next summary refresh, even when the model writes it again', async () => {
    const lines = (await get()).body.lines;
    await forget(lines[1].id);

    // The transcript is unchanged, so the summariser happily re-derives it —
    // slightly re-worded, as models do.
    installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' }));
    let turn = 0;
    installChatJson(async (messages) => {
      const isSummariser = messages[0].content.includes('rolling memory');
      if (isSummariser) {
        return {
          summary: 'يعيش وحده في وهران منذ سنة. يتشاجر دائماً مع أخيه ولم يكلمه منذ شهرين تقريباً. ساعده تمرين التنفس.',
          topics: ['family'], emotion: 'sadness', followUp: '',
        };
      }
      turn += 1;
      return { reply: `رد ${turn}`, emotion: 'neutral', exerciseKey: null };
    });

    // Four exchanges = 8 messages = one refresh.
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/api/ai/chat').set('Authorization', bearer).send({ text: `رسالة ${i}` });
    }
    await settle();

    expect(stateNow().summary).not.toContain('أخيه');
    expect(stateNow().summary).toContain('وهران');       // the rest came back fine
  });

  it('the forget list is never sent to the LLM', async () => {
    const lines = (await get()).body.lines;
    await forget(lines[1].id);

    const sent = [];
    installClassify(async () => ({ risk: 'none', confidence: 1, reason: 'ok' }));
    installChatJson(async (messages) => {
      sent.push(JSON.stringify(messages));
      return messages[0].content.includes('rolling memory')
        ? { summary: 'ملخص جديد.', topics: [], emotion: 'neutral', followUp: '' }
        : { reply: 'حسناً.', emotion: 'neutral', exerciseKey: null };
    });
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/api/ai/chat').set('Authorization', bearer).send({ text: `رسالة ${i}` });
    }
    await settle();

    // The forgotten tokens must not reach a third-party model in ANY prompt —
    // "never mention X" is itself a disclosure of X.
    for (const payload of sent) expect(payload).not.toContain('يكلمه');
  });
});

describe('forgetting everything', () => {
  it('clears summary, topics, emotion and the home-screen follow-up', async () => {
    const res = await forgetAll();
    expect(res.status).toBe(200);
    expect(res.body.lines).toEqual([]);
    expect(stateNow()).toMatchObject({ summary: '', topics: [], emotion: null, followUp: '' });
  });

  it('remembers every cleared line as forgotten, so none of it returns', async () => {
    await forgetAll();
    const forgotten = stateNow().forgotten;
    expect(forgotten).toHaveLength(3);
    expect(memory.applyForgotten(SUMMARY_AR, forgotten)).toBe('');
  });

  it('leaves the thread and the clinical record alone', async () => {
    await fake.impl.insertAiMessage({ conversationId, role: 'user', text: 'رسالة قديمة' });
    await fake.impl.insertSafetyAlert({
      patientId: patient.id, source: 'ai_chat', status: 'open', detail: { trigger: 'نص حساس', hold: true },
    });
    await forgetAll();
    expect(fake.state.aiMessages).toHaveLength(1);
    expect([...fake.state.alerts.values()][0].detail.trigger).toBe('نص حساس');
  });

  it('is allowed during a crisis hold — the alert and transcript are what the specialist needs', async () => {
    await fake.impl.insertSafetyAlert({
      patientId: patient.id, source: 'ai_chat', status: 'open', detail: { hold: true },
    });
    expect((await forgetAll()).status).toBe(200);
    // ...while wiping the whole thread stays refused.
    const wipe = await request(app).delete('/api/ai/history').set('Authorization', bearer);
    expect(wipe.status).toBe(409);
  });
});

describe('the matcher itself', () => {
  it('catches a re-worded restatement of a forgotten line', () => {
    const forgotten = [memory.tokensOf('يتشاجر كثيراً مع أخيه ولم يكلمه منذ شهرين')];
    expect(memory.isForgotten('لم يكلم أخيه منذ شهرين بسبب شجار', forgotten)).toBe(true);
  });

  it('catches a restatement that switches Arabic verb form (the live-data miss)', () => {
    // يكلم (form II) vs يتكلم (form V): same root, and no amount of affix
    // stripping makes the strings equal, because Arabic derives by infix.
    // A patient re-telling a fact will naturally use a different form, so
    // matching has to compare word cores, not whole tokens.
    const forgotten = [memory.tokensOf('يتشاجر كثيراً مع أخيه ولم يكلمه منذ شهرين')];
    expect(memory.isForgotten('لم يتكلم مع أخيه منذ شهرين بسبب شجار', forgotten)).toBe(true);
  });

  it('does not let core-matching swallow a genuinely different line', () => {
    const forgotten = [memory.tokensOf('يتشاجر كثيراً مع أخيه ولم يكلمه منذ شهرين')];
    expect(memory.isForgotten('بدأ يمشي كل صباح وساعده ذلك على النوم', forgotten)).toBe(false);
    expect(memory.isForgotten('يعيش وحده في وهران منذ سنة', forgotten)).toBe(false);
  });

  it('leaves unrelated lines alone', () => {
    const forgotten = [memory.tokensOf('يتشاجر كثيراً مع أخيه ولم يكلمه منذ شهرين')];
    expect(memory.isForgotten('ساعده تمرين التنفس قبل النوم', forgotten)).toBe(false);
  });

  it('ignores Arabic diacritics and French accents when matching', () => {
    const ar = [memory.tokensOf('يَتَشاجَرُ مع أخيه')];
    expect(memory.isForgotten('يتشاجر مع اخيه', ar)).toBe(true);
    const fr = [memory.tokensOf('Il a arrêté ses études à Alger')];
    expect(memory.isForgotten('Etudes arretees a Alger', fr)).toBe(true);
  });

  it('refuses to build a bag thin enough to silence a whole subject', () => {
    // "sleep." on its own would match every future line mentioning sleep.
    const forgotten = [memory.tokensOf('النوم')];
    expect(memory.isForgotten('النوم صعب هذه الأيام وساعده تمرين التنفس', forgotten)).toBe(false);
  });
});
