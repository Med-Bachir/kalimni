// LLM risk classifier — the second layer of the safety net.
//
// Layer 1 (instant, always on): the keyword scan in utils/safety.js, applied
// synchronously when a message is sent.
// Layer 2 (this file, async): an LLM reads the message and catches what
// keywords miss — Arabizi ("nmout", "n7ebch n3ich"), misspellings, indirect
// phrasing — and understands negations/metaphors that keywords over-flag.
//
// Design rules:
//   - The LLM only ADDS alerts. It never removes or downgrades a keyword
//     alert: a false negative is the one unaffordable error.
//   - Fire-and-forget: called after the message is already delivered; a slow
//     or dead AI endpoint never delays or breaks chat.
//   - Provider-agnostic: any OpenAI-compatible endpoint (Gemini, Groq,
//     Mistral, Ollama) via AI_BASE_URL / AI_MODEL / AI_API_KEY in .env
//     (HTTP + retries live in llmClient.js, shared with the AI companion).
//   - No key configured -> layer 2 is silently off; layer 1 still protects.
const config = require('../config');
const repos = require('../data/repos');
const { emitToUser, emitToAdmins } = require('../realtime');
const push = require('./pushService');
const llm = require('./llmClient');

const SYSTEM_PROMPT = `You are a clinical safety classifier for "Kalimni", a teletherapy chat app used in Algeria. You read ONE message a patient sent to their therapist and assess the PATIENT'S OWN risk of suicide or self-harm. This is a safety net: a missed warning (false negative) is far more harmful than a false alarm, so when genuinely unsure between two levels, ALWAYS pick the higher one.

Language: messages may be in Modern Standard Arabic, Algerian Darija (Arabic script), Arabizi (Darija in Latin letters/digits: "3"=ع, "7"=ح/ه, "9"=ق, "kh"=خ, "gh"=غ, "ch"=ش; e.g. "nmout"=I die, "n3ich"=I live, "3yit"=I'm exhausted, "rou7i/rasi"=myself, "khlas"=enough/done), French, or a mix. Interpret meaning, not keywords — there is NO fixed word list.

Output ONLY a compact JSON object, nothing before or after, no markdown fences:
{"risk":"none|low|high","confidence":0.0-1.0,"reason":"<short English explanation>"}

Classify into exactly one level:
- "high" — ANY expression of wanting to die or hurt oneself, direct or indirect. Includes: active intent ("I want to die", "nmout", "n7ebch n3ich"), passive ideation ("no reason to keep living", "the world is better without me", "wish I wouldn't wake up"), wanting to permanently escape/rest ("nheb nrtah/nemchi/nkhlas men had denya"), any plan, method, means, timing, or a farewell/apology-to-family message. If a death or self-harm wish is present in ANY form, it is "high".
- "low" — serious hopelessness, worthlessness, exhaustion or feeling like a burden, but with NO reference to death or self-harm ("nothing matters", "I can't go on like this", "makanch fayda", "3yit men kolch").
- "none" — everything else: ordinary sadness/anxiety/stress, positive or neutral talk, questions, scheduling; death used as a METAPHOR or idiom ("this exam is killing me", "dead tired / meyet men t3ab", "died laughing"); an EXPLICIT negation ("I'm NOT thinking of suicide"); or risk that concerns ANOTHER person (a friend/relative), not the patient.

Key rules:
- Judge only the patient themselves. A third party at risk = "none" (say so in reason).
- Plain sadness with no death/self-harm reference is at most "low", never "high".
- An indirect or metaphor-shaped death wish ("the world is better without me") is still "high".
- Do not require explicit words like "suicide" — infer intent from meaning across all three languages.`;

// Few-shot pairs covering the exact blind spots this layer exists for.
const FEW_SHOTS = [
  ['نموت خير من هاد الحياة',
    '{"risk":"high","confidence":0.95,"reason":"Darija: dying would be better than this life — death wish."}'],
  ['nmout w nertah men kolch',
    '{"risk":"high","confidence":0.93,"reason":"Arabizi: I (would) die and rest from everything — death wish."}'],
  ['n7ebch n3ich khlas, 3yit',
    '{"risk":"high","confidence":0.92,"reason":"Arabizi: I do not want to live anymore, I am exhausted."}'],
  ['je veux en finir avec tout ça',
    '{"risk":"high","confidence":0.85,"reason":"French: wanting to end it all — likely suicidal intent."}'],
  ['وداعاً، سامحوني على كل شيء، ديرو بالكم على ماما',
    '{"risk":"high","confidence":0.9,"reason":"Farewell message with instructions about family."}'],
  ['je ne vois plus de raison de continuer à vivre',
    '{"risk":"high","confidence":0.88,"reason":"French: no reason left to keep living — passive suicidal ideation."}'],
  ['الدنيا بلا بيا خير، ماحدش يحتاجني',
    '{"risk":"high","confidence":0.9,"reason":"Darija: the world is better without me — passive suicidal ideation."}'],
  ['tout le monde serait mieux sans moi',
    '{"risk":"high","confidence":0.9,"reason":"French: everyone would be better off without me — passive ideation."}'],
  ['nheb ghir nemchi men had denya w nrtah',
    '{"risk":"high","confidence":0.9,"reason":"Arabizi: I just want to leave this world and rest — death wish."}'],
  ['ما نيش نفكر في الانتحار، غير حاب نفهم علاش الواحد يوصل لهاد الحالة',
    '{"risk":"none","confidence":0.85,"reason":"Explicit negation: NOT thinking of suicide, asking to understand the topic."}'],
  ['هاد الامتحان راح يقتلني 😅',
    '{"risk":"none","confidence":0.97,"reason":"Metaphor: the exam will kill me — humorous idiom."}'],
  ['khdemt bzf lyoum, rani meyet men t3ab',
    '{"risk":"none","confidence":0.95,"reason":"Arabizi idiom: dead tired from work — not self-harm."}'],
  ['صاحبي قالي بلي راه يفكر يدير حاجة في روحو، واش ندير؟',
    '{"risk":"none","confidence":0.8,"reason":"Third party at risk (a friend), not the patient. Therapist should still read this."}'],
  ['ma vie n\'a plus aucun sens, je n\'arrive plus à me lever le matin',
    '{"risk":"low","confidence":0.75,"reason":"Deep hopelessness and impairment, but no death or self-harm reference."}'],
  ['rani 3yit men kolch, makanch fayda',
    '{"risk":"low","confidence":0.7,"reason":"Arabizi: exhausted by everything, nothing is worth it — despair without death reference."}'],
];

/**
 * Classifies one message. Returns { risk, confidence, reason } or null when
 * the classifier is not configured. Retries transient failures, then throws.
 */
async function classify(text) {
  if (!config.aiApiKey) return null;

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const [user, assistant] of FEW_SHOTS) {
    messages.push({ role: 'user', content: user });
    messages.push({ role: 'assistant', content: assistant });
  }
  messages.push({ role: 'user', content: String(text).slice(0, 2000) });

  // Room for the ~40-token JSON reply (generous for Gemini thinking tokens).
  const parsed = await llm.chatJson(messages, { maxTokens: 512, temperature: 0, tag: 'risk' });
  if (!['none', 'low', 'high'].includes(parsed.risk)) {
    throw new Error(`ai_bad_risk_value: ${JSON.stringify(parsed).slice(0, 100)}`);
  }
  return {
    risk: parsed.risk,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    reason: String(parsed.reason || ''),
  };
}

/**
 * Fire-and-forget scan of a just-sent patient message. On "high": flags the
 * message, opens a safety alert and notifies specialist + admins — the same
 * pipeline the keyword scan uses. Skips messages the keywords already flagged.
 */
async function scanMessageAsync({ message, sender, conversation }) {
  if (!config.aiApiKey) return;
  if (sender.role !== 'patient') return;
  if (message.riskFlag) return; // layer 1 already alerted

  try {
    const result = await classify(message.text);
    if (!result) return;

    if (result.risk !== 'high') {
      if (result.risk === 'low') {
        console.log(`[risk] low (${result.confidence.toFixed(2)}) msg=${message.id}: ${result.reason}`);
      }
      return;
    }

    const flagged = await repos.setMessageRiskFlag(message.id);
    const alert = await repos.insertSafetyAlert({
      patientId: sender.id,
      specialistId: conversation.specialistId,
      messageId: message.id,
      source: 'chat',
      status: 'open',
    });
    console.log(`[risk] HIGH (${result.confidence.toFixed(2)}) msg=${message.id}: ${result.reason}`);

    // The message was already delivered with riskFlag=false (this scan runs
    // after send). Re-emit the updated row so both chat views live-update:
    // the specialist's bubble gets the red "flagged" styling, the patient's
    // own view can raise the crisis banner. Clients replace by message id.
    emitToUser(conversation.specialistId, 'message:update', { message: flagged });
    emitToUser(sender.id, 'message:update', { message: flagged });

    emitToUser(conversation.specialistId, 'safety:alert', { alert, message: flagged });
    emitToAdmins('safety:alert', { alert, message: flagged });
    push.pushSafetyAlert({ alert, patient: sender });
  } catch (err) {
    // Never let the AI layer take chat down with it.
    console.error('[risk] classification failed:', err.message);
  }
}

module.exports = { classify, scanMessageAsync };
