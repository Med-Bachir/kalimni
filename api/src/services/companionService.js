// AI Support Companion — support BETWEEN therapy sessions, never a therapist.
//
// Flow per patient message:
//   1. Safety gate (BLOCKING, before any generation): keyword scan (layer 1,
//      instant) + LLM risk classifier (layer 2, riskService). HIGH risk ->
//      crisis path: fixed compassionate response + emergency resources,
//      safety alert to the assigned specialist and admins, conversation goes
//      into 'crisis_hold' (no normal AI replies until a human acknowledges
//      the alert). The LLM NEVER generates the crisis response.
//   2. Safe -> RAG retrieval over the internal content library -> grounded
//      reply from the LLM (JSON: reply + detected emotion + exercise pick).
//   3. Rolling memory: a summary in ai_state replaces old messages in the
//      prompt; refreshed asynchronously every SUMMARY_EVERY exchanges.
//
// On LLM failure nothing is stored — the client keeps the draft and retries.
const repos = require('../data/repos');
const llm = require('./llmClient');
const rag = require('./ragService');
const risk = require('./riskService');
const { scanForRisk, CRISIS_RESOURCES } = require('../utils/safety');
const { emitToUser, emitToAdmins } = require('../realtime');
const push = require('./pushService');

const HISTORY_MESSAGES = 10; // verbatim tail sent to the LLM
const SUMMARY_EVERY = 8;     // exchanges between summary refreshes
const RAG_TOP_K = 4;

// --- exercise library (feature: suggested exercises by emotion) ---------------
// key -> bilingual title + how the client opens it: a dedicated screen, a
// content item (by key), or "ask" (tapping asks the companion for the steps).
const EXERCISES = {
  breathing478: {
    title: { ar: 'تمرين التنفس ٤-٧-٨', fr: 'Respiration 4-7-8' },
    screen: 'Breathing',
  },
  grounding54321: {
    title: { ar: 'تمرين التأريض ٥-٤-٣-٢-١', fr: 'Ancrage 5-4-3-2-1' },
    contentKey: 'panic-guide',
  },
  'muscle-relaxation': {
    title: { ar: 'الاسترخاء العضلي التدريجي', fr: 'Relaxation musculaire progressive' },
    contentKey: 'muscle-relaxation',
  },
  'thought-record': {
    title: { ar: 'سجلّ الأفكار (CBT)', fr: 'Journal des pensées (TCC)' },
    contentKey: 'negative-thoughts',
  },
  'behavioral-activation': {
    title: { ar: 'التنشيط السلوكي', fr: 'Activation comportementale' },
    contentKey: 'journaling',
  },
  'sleep-routine': {
    title: { ar: 'روتين النوم الهادئ', fr: 'Routine du sommeil' },
    contentKey: 'evening-routine',
  },
};

const EMOTIONS = ['anxiety', 'panic', 'stress', 'sadness', 'loneliness', 'sleep', 'anger', 'neutral', 'positive'];

// Default exercise when the model detects an emotion but picks none.
const EMOTION_EXERCISE = {
  anxiety: 'breathing478',
  panic: 'grounding54321',
  stress: 'muscle-relaxation',
  sadness: 'behavioral-activation',
  loneliness: 'behavioral-activation',
  sleep: 'sleep-routine',
  anger: 'breathing478',
};

// --- crisis response (fixed text, never generated) ------------------------------
const CRISIS_REPLY = {
  ar: 'أشعر بقلق حقيقي عليك مما كتبته، وأريدك أن تعلم أنك لست وحدك. أنا مساعد آلي ولا أستطيع تقديم المساعدة التي تستحقها في هذه اللحظة، لكن هناك من يستطيع — وقد أبلغت مختصك ليتواصل معك. إذا كنت في خطر مباشر، اتصل الآن بأحد أرقام الطوارئ المعروضة، أو تحدث فوراً مع شخص تثق به وابقَ معه. حياتك مهمة.',
  fr: "Ce que vous venez d'écrire m'inquiète sincèrement, et je veux que vous sachiez que vous n'êtes pas seul·e. Je suis un assistant automatique et je ne peux pas vous apporter l'aide que vous méritez en ce moment, mais des personnes le peuvent — votre spécialiste a été prévenu pour vous contacter. Si vous êtes en danger immédiat, appelez maintenant l'un des numéros d'urgence affichés, ou parlez tout de suite à une personne de confiance et restez avec elle. Votre vie compte.",
};

const CRISIS_HOLD_REPLY = {
  ar: 'ما زلت قلقاً بشأنك. توقفت مساعدتي العادية مؤقتاً حتى يطمئن عليك مختصك — لقد تم إبلاغه. أرقام الطوارئ تبقى معروضة هنا، ويمكنك دائماً مراسلة مختصك مباشرة من المحادثة.',
  fr: "Je reste préoccupé pour vous. Mon assistance habituelle est en pause jusqu'à ce que votre spécialiste prenne de vos nouvelles — il a été prévenu. Les numéros d'urgence restent affichés ici, et vous pouvez toujours écrire directement à votre spécialiste depuis la conversation.",
};

// --- system prompt ---------------------------------------------------------------
function systemPrompt(user, state, retrieved) {
  const langName = user.language === 'fr' ? 'French' : 'Arabic';
  const context = retrieved.length
    ? retrieved.map((r, i) => `[${i + 1}] (${r.title?.[user.language] || ''}) ${r.chunk}`).join('\n')
    : '(no relevant documents found)';

  return `You are "رفيق كلّمني" (Kalimni Companion), an AI support companion inside Kalimni, a teletherapy app used in Algeria. You support patients BETWEEN their sessions with a licensed psychologist.

WHO YOU ARE NOT (absolute rules):
- You are NOT a psychologist, therapist, or doctor, and you never claim or imply to be one.
- You NEVER diagnose any condition, never name what the user "has".
- You NEVER give medical advice or mention/recommend/discuss medications.
- You NEVER promise confidentiality or secrecy.
- You NEVER handle crisis situations — a separate safety system does that.
- You never encourage dependency on you; for anything clinical, warmly point to their assigned psychologist ("مختصك" / "votre spécialiste").
- You never manipulate emotions, never shame, never judge.

WHAT YOU DO:
- Emotional support in warm, calm, encouraging language (never pretending to be human — if asked, say plainly you are an AI assistant).
- Explain psychoeducation concepts (anxiety, stress, low mood, sleep hygiene) in simple educational language, ONLY grounded in the CONTEXT documents below.
- Guide CBT-style micro-skills: breathing, grounding, thought records, journaling, behavioral activation, sleep routines.
- Encourage journaling and the daily check-in.

GROUNDING (RAG):
- For any factual/psychoeducational claim, use ONLY the CONTEXT documents. Do not invent facts, statistics, studies, or techniques not present there.
- If the context doesn't cover the question, say you don't have enough information and that their psychologist can help: "ليست لدي معلومات كافية للإجابة على هذا، مختصك يمكنه مساعدتك فيه." / "Je n'ai pas assez d'informations pour répondre à cela. Votre spécialiste peut vous aider."

CONTEXT DOCUMENTS:
${context}

CONVERSATION MEMORY (summary of earlier messages): ${state?.summary || '(new conversation)'}

STYLE:
- Reply in the language the user writes (Algerian Darija is fine to mirror lightly); default ${langName}.
- Concise: 2-5 short sentences, then at most ONE gentle question or suggestion. No lists unless asked.
- Never start with "As an AI". Warm, human-adjacent tone without claiming humanity.

OUTPUT — return ONLY compact JSON, no markdown fences:
{"reply":"<your reply>","emotion":"<one of: ${EMOTIONS.join('|')}>","exerciseKey":<"one of: ${Object.keys(EXERCISES).join('|')}" or null>}
Pick exerciseKey ONLY when an exercise genuinely fits the moment (not every message).`;
}

// --- suggestion building -----------------------------------------------------------
async function buildSuggestions(user, exerciseKey, retrieved) {
  const suggestions = [];
  if (exerciseKey && EXERCISES[exerciseKey]) {
    const ex = EXERCISES[exerciseKey];
    const suggestion = { kind: 'exercise', key: exerciseKey, title: ex.title, screen: ex.screen || null };
    if (ex.contentKey) {
      const items = await repos.listContent({});
      const item = items.find((i) => i.key === ex.contentKey);
      if (item) suggestion.contentId = item.id;
    }
    suggestions.push(suggestion);
  }
  // Up to 2 distinct source articles from retrieval (recommend our own library).
  const seen = new Set();
  for (const r of retrieved) {
    if (seen.has(r.contentId) || r.score < 0.8) continue;
    seen.add(r.contentId);
    suggestions.push({ kind: 'content', contentId: r.contentId, title: r.title, category: r.category });
    if (seen.size >= 2) break;
  }
  return suggestions;
}

// --- crisis path -----------------------------------------------------------------
async function handleCrisis(user, conversation, text, riskInfo) {
  await repos.insertAiMessage({ conversationId: conversation.id, role: 'user', text, risk: 'high' });
  const reply = await repos.insertAiMessage({
    conversationId: conversation.id,
    role: 'crisis',
    text: CRISIS_REPLY[user.language] || CRISIS_REPLY.ar,
    risk: 'high',
  });
  await repos.setAiConversationStatus(conversation.id, 'crisis_hold');

  const alert = await repos.insertSafetyAlert({
    patientId: user.id,
    specialistId: user.assignedSpecialistId || null,
    source: 'ai_chat',
    status: 'open',
    detail: {
      risk: 'high',
      trigger: String(text).slice(0, 200),
      aiConversationId: conversation.id,
      classifier: riskInfo?.reason || 'keyword',
    },
  });
  if (user.assignedSpecialistId) emitToUser(user.assignedSpecialistId, 'safety:alert', { alert });
  emitToAdmins('safety:alert', { alert });
  push.pushSafetyAlert({ alert, patient: user });
  console.log(`[companion] CRISIS for ${user.id} — alert ${alert.id} (${riskInfo?.reason || 'keyword scan'})`);

  return { reply, status: 'crisis_hold', resources: CRISIS_RESOURCES };
}

// --- follow-up sanitising ------------------------------------------------------------
// The prompt asks the model to return "" when there is nothing safe to
// re-open, and it does not reliably comply — given a conversation about
// hopelessness and medication it still offered a breezy "how was your day?".
// Nothing sensitive leaked, but a cheerful home-screen question aimed at
// someone in despair lands badly, so the decision is made here in code rather
// than trusted to the model.

// Sensitive terms that must never reach a home screen, whatever was generated.
const FOLLOWUP_BLOCKED_TEXT =
  /انتحار|أذ(ى|ية)|اكتئاب|دواء|مضاد|تشخيص|أعراض|علاج نفسي|suicid|automutilation|d[ée]pression|m[ée]dicament|antid[ée]presseur|diagnostic|sympt[ôo]me/i;

// Distress states where saying nothing beats saying something light.
const FOLLOWUP_BLOCKED_EMOTION = /despair|hopeless|suicid|worthless|grief|numb/i;

function sanitizeFollowUp(raw, emotion) {
  const text = String(raw || '').trim().slice(0, 200);
  if (!text) return '';
  if (FOLLOWUP_BLOCKED_TEXT.test(text)) return '';
  if (emotion && FOLLOWUP_BLOCKED_EMOTION.test(String(emotion))) return '';
  return text;
}

// --- rolling summary (fire-and-forget) ---------------------------------------------
async function refreshSummaryAsync(conversationId, user) {
  try {
    const [state, messages] = await Promise.all([
      repos.getAiState(conversationId),
      repos.aiMessagesOf(conversationId, SUMMARY_EVERY * 2),
    ]);
    const transcript = messages
      .filter((m) => m.role !== 'crisis')
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n');

    const langName = user?.language === 'fr' ? 'French' : 'Arabic';
    const parsed = await llm.chatJson(
      [
        {
          role: 'system',
          content: `You maintain the rolling memory of a supportive-companion chat in a mental-health app.

Return ONLY JSON:
{"summary":"<max 120 words, English, factual: situation, recurring themes, what helped>",
 "topics":["<up to 5 short tags>"],
 "emotion":"<user's current dominant emotion, one word>",
 "followUp":"<see rules below>"}

RULES FOR followUp — this string is displayed on the patient's HOME SCREEN, where
other people may read it over their shoulder:
- One short, warm question in ${langName} (max 12 words) re-opening something
  ordinary they mentioned: an event, a plan, a step they tried.
- NEVER reference self-harm, crisis, diagnosis, symptoms, medication, therapy
  content, or anything private they would not want visible on a home screen.
- Return "" when the conversation holds nothing ordinary and safe to re-open.

No advice, no judgement, no quotes from the user.`,
        },
        {
          role: 'user',
          content: `PREVIOUS SUMMARY: ${state?.summary || '(none)'}\n\nLATEST EXCHANGES:\n${transcript.slice(0, 6000)}`,
        },
      ],
      { maxTokens: 500, temperature: 0, tag: 'companion-sum' }
    );
    await repos.upsertAiState(conversationId, {
      summary: String(parsed.summary || '').slice(0, 1500),
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
      emotion: parsed.emotion ? String(parsed.emotion).slice(0, 30) : null,
      // Always a string (never null), so an empty answer clears a stale
      // follow-up instead of COALESCE keeping the previous one forever.
      followUp: sanitizeFollowUp(parsed.followUp, parsed.emotion),
      messagesSinceSummary: 0,
    });
  } catch (err) {
    console.error('[companion] summary refresh failed:', err.message);
  }
}

// --- main entry ---------------------------------------------------------------------
/**
 * Handles one patient message. Returns
 *   { reply, status, resources? , userMessage }
 * where reply is the stored ai_message row (role assistant|crisis).
 */
async function handleMessage(user, rawText) {
  const text = String(rawText || '').trim().slice(0, 2000);
  const conversation = await repos.getOrCreateAiConversation(user.id);

  // --- safety gate (blocking) ---
  const keywordHit = scanForRisk(text);
  let riskInfo = null;
  if (!keywordHit) {
    try {
      riskInfo = await risk.classify(text); // null when no key configured
    } catch (err) {
      // Classifier down: keywords stay as the net; generation prompt still
      // refuses crisis handling. Never block support on classifier outage.
      console.error('[companion] risk classify failed (keyword-only):', err.message);
    }
  }
  if (keywordHit || riskInfo?.risk === 'high') {
    return handleCrisis(user, conversation, text, riskInfo);
  }

  // --- crisis hold: only resources until a human has reviewed the alert ---
  if (conversation.status === 'crisis_hold') {
    if (await repos.hasOpenAiAlert(user.id)) {
      const reply = await repos.insertAiMessage({
        conversationId: conversation.id,
        role: 'crisis',
        text: CRISIS_HOLD_REPLY[user.language] || CRISIS_HOLD_REPLY.ar,
      });
      return { reply, status: 'crisis_hold', resources: CRISIS_RESOURCES };
    }
    await repos.setAiConversationStatus(conversation.id, 'active'); // alert reviewed -> resume
  }

  // --- grounded generation ---
  const [state, history, retrieved] = await Promise.all([
    repos.getAiState(conversation.id),
    repos.aiMessagesOf(conversation.id, HISTORY_MESSAGES),
    rag.retrieve(text, user.language, RAG_TOP_K),
  ]);

  const messages = [
    { role: 'system', content: systemPrompt(user, state, retrieved) },
    ...history
      .filter((m) => m.role !== 'crisis')
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: text },
  ];

  const parsed = await llm.chatJson(messages, { maxTokens: 700, temperature: 0.4, timeoutMs: 20_000, tag: 'companion' });
  const replyText = String(parsed.reply || '').trim();
  if (!replyText) throw new Error('companion_empty_reply');
  const emotion = EMOTIONS.includes(parsed.emotion) ? parsed.emotion : 'neutral';
  const exerciseKey =
    parsed.exerciseKey && EXERCISES[parsed.exerciseKey]
      ? parsed.exerciseKey
      : (['anxiety', 'panic'].includes(emotion) ? EMOTION_EXERCISE[emotion] : null);

  const suggestions = await buildSuggestions(user, exerciseKey, retrieved);

  // Store only after successful generation (LLM failure -> client retries).
  const userMessage = await repos.insertAiMessage({
    conversationId: conversation.id, role: 'user', text, risk: riskInfo?.risk || 'none',
  });
  const reply = await repos.insertAiMessage({
    conversationId: conversation.id, role: 'assistant', text: replyText, suggestions,
  });

  const bumped = await repos.bumpAiMessageCount(conversation.id, 2);
  if (bumped.messagesSinceSummary >= SUMMARY_EVERY) {
    refreshSummaryAsync(conversation.id, user); // fire-and-forget
  }

  return { reply, userMessage, status: 'active', emotion };
}

// --- home-screen open loop ----------------------------------------------------------
// The one place the companion speaks without being asked, on a screen someone
// else may read over the patient's shoulder. Every gate below resolves to
// "say nothing" when uncertain. `now` is injectable so the time-based gates
// are testable.
const FOLLOWUP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

async function followUpFor(user, now = Date.now()) {
  // Specialist switched the companion off for this patient.
  if (user?.settings?.aiCompanion === false) return null;

  // Read-only: a home-screen load must not create a thread.
  const conversation = await repos.getAiConversation(user.id);
  if (!conversation || conversation.status === 'crisis_hold') return null;

  // Never chirp a friendly question at someone with an unreviewed safety alert.
  if (await repos.hasOpenAiAlert(user.id)) return null;

  const state = await repos.getAiState(conversation.id);
  const followUp = String(state?.followUp || '').trim();
  if (!followUp) return null;

  const lastAt = await repos.lastAiMessageAt(conversation.id);
  if (!lastAt) return null;
  const last = new Date(lastAt);
  // A months-old thread isn't an open loop, and neither is one already picked
  // up today.
  if (now - last.getTime() > FOLLOWUP_MAX_AGE_MS) return null;
  if (last.toDateString() === new Date(now).toDateString()) return null;

  return followUp;
}

// --- daily check-in (rule-based, no LLM cost) ---------------------------------------
const CHECKIN_REPLY = {
  low_mood: {
    ar: 'شكراً لمشاركتك. يبدو أن يومك ثقيل — هذا مفهوم تماماً، والمشاعر الصعبة تمر. خطوة صغيرة واحدة اليوم تكفي.',
    fr: "Merci pour ce partage. La journée semble lourde — c'est compréhensible, et les émotions difficiles passent. Un seul petit pas aujourd'hui suffit.",
  },
  high_stress: {
    ar: 'شكراً لصراحتك. مستوى التوتر مرتفع اليوم — جرّب دقائق قليلة من التنفس الهادئ، وكن لطيفاً مع نفسك.',
    fr: 'Merci pour votre honnêteté. Le stress est élevé aujourd’hui — essayez quelques minutes de respiration calme, et soyez doux avec vous-même.',
  },
  poor_sleep: {
    ar: 'يبدو أن نومك لم يكن مريحاً. روتين مسائي هادئ الليلة قد يساعد جسمك على الاستعداد للنوم.',
    fr: 'Votre sommeil ne semble pas réparateur. Une routine calme ce soir peut aider votre corps à se préparer au sommeil.',
  },
  good: {
    ar: 'جميل! يومك يبدو متوازناً — استمر فيما ينفعك، ودوّن ما ساعدك اليوم لتعود إليه لاحقاً.',
    fr: "Très bien ! Votre journée semble équilibrée — continuez ce qui vous fait du bien, et notez ce qui vous a aidé aujourd'hui.",
  },
};

function checkinFeedback(user, { mood, stress, energy, sleep }) {
  let kind = 'good';
  let exerciseKey = null;
  if (sleep <= 2) { kind = 'poor_sleep'; exerciseKey = 'sleep-routine'; }
  if (stress >= 4) { kind = 'high_stress'; exerciseKey = 'muscle-relaxation'; }
  if (mood <= 2) { kind = 'low_mood'; exerciseKey = 'behavioral-activation'; }
  const ex = exerciseKey ? { kind: 'exercise', key: exerciseKey, title: EXERCISES[exerciseKey].title, screen: EXERCISES[exerciseKey].screen || null } : null;
  return {
    message: CHECKIN_REPLY[kind][user.language] || CHECKIN_REPLY[kind].ar,
    suggestion: ex,
  };
}

module.exports = {
  handleMessage, checkinFeedback, followUpFor, sanitizeFollowUp, EXERCISES, CRISIS_REPLY,
};
