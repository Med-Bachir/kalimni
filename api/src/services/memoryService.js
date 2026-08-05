// Phase 2.4 — the companion's memory, owned by the patient it describes.
//
// `ai_state.summary` is written by an LLM about a psychiatric patient, from
// 6000 characters of their own transcript, every 8 exchanges. Until now they
// could not see it, correct it, or delete it. This service makes it readable,
// editable and — the hard part — *forgettable*.
//
// Forgetting is the only operation that needs machinery. Removing a line from
// the stored text is trivial; the next refresh reads the same transcript and
// writes the same line back, and a "forget" that lasts eight messages is a
// lie. So a forgotten line leaves behind a normalised token bag, and every
// regenerated summary is filtered through those bags before it is stored.
//
// Two deliberate constraints on that mechanism:
//
//   1. The forgotten bags are NEVER sent to the LLM. Telling a third-party
//      model "do not mention X" transmits X to it — the exact thing the
//      patient asked us not to do. Enforcement is local and post-hoc.
//   2. We store token bags, not sentences. Guaranteeing "never resurface
//      this" is impossible while remembering nothing, so the honest design
//      keeps the least that still matches: stop-worded, de-duplicated,
//      sorted tokens. This is documented on the patient's screen too.
const repos = require('../data/repos');

const MAX_SUMMARY_CHARS = 1500;
const MAX_FORGOTTEN = 60;      // FIFO; a bounded list cannot become its own archive
const MIN_TOKENS = 2;          // a one-token bag would silence a whole subject
const MATCH_THRESHOLD = 0.6;   // share of a NEW line's tokens covered by a bag

// Sentence-ish split. The summariser writes 2-5 plain sentences; Arabic uses
// '،' and '؟' and often no full stop between clauses, so newlines count too.
const SPLIT = /(?<=[.!?؟。])\s+|\n+/;

// Stopwords in the three languages a summary can be written in. Their only
// job is to stop "I" / "et" / "في" from dominating a token bag.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'has', 'have', 'had', 'that', 'this', 'it', 'he', 'she', 'they',
  'his', 'her', 'their', 'i', 'you', 'your', 'my', 'me', 'not', 'no', 'as', 'by', 'from', 'about',
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'que', 'qui', 'dans', 'sur',
  'pour', 'avec', 'est', 'sont', 'a', 'ai', 'au', 'aux', 'ce', 'cette', 'il', 'elle', 'ils',
  'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'je', 'vous', 'ne', 'pas', 'plus', 'se', 'en', 'par',
  'في', 'من', 'على', 'عن', 'إلى', 'الى', 'مع', 'أن', 'ان', 'أنا', 'انا', 'هو', 'هي', 'هذا',
  'هذه', 'ذلك', 'التي', 'الذي', 'لا', 'ما', 'و', 'ثم', 'قد', 'كان', 'كانت', 'له', 'لها',
]);

// Arabic diacritics + tatweel, and the alef/ya/ta-marbuta variants that make
// the same word look like three words.
const stripArabicMarks = (s) =>
  s.replace(/[ً-ْـ]/g, '')  // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ -> ا
    .replace(/ى/g, 'ي')            // ى -> ي
    .replace(/ة/g, 'ه');           // ة -> ه

// Light Arabic stemming (Larkey-style affix stripping, not a real stemmer).
// Without it "يكلمه" and "يكلم", or "أخيه" and "الأخ", are different tokens —
// and a patient's re-worded line would slip past the forget filter on
// grammar alone. Only ever shortens to >= 3 characters.
const AR_PREFIXES = ['وال', 'بال', 'كال', 'فال', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];
const AR_SUFFIXES = ['ها', 'ات', 'ون', 'ين', 'ان', 'يه', 'ية', 'هم', 'ه', 'ي'];
const isArabic = (w) => /[؀-ۿ]/.test(w);

function lightStem(word) {
  if (!isArabic(word)) return word;
  let w = word;
  for (const p of AR_PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) { w = w.slice(p.length); break; }
  }
  for (const s of AR_SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 3) { w = w.slice(0, -s.length); break; }
  }
  return w;
}

function tokensOf(text) {
  const normalised = stripArabicMarks(String(text || '').toLowerCase())
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // French accents
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = normalised
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(lightStem)
    .filter((w) => w.length > 2);
  return [...new Set(tokens)].sort();
}

// Stable id for a line, so "forget line 3" survives a concurrent refresh
// reordering the text. Content-derived, not positional.
function lineId(text) {
  const tokens = tokensOf(text);
  let h = 5381;
  for (const ch of tokens.join(' ')) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return `ln_${h.toString(36)}`;
}

function splitLines(summary) {
  return String(summary || '')
    .split(SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ id: lineId(text), text }));
}

// Longest common substring length. Small strings only — this runs once per
// line per refresh, over bags of a dozen tokens.
function lcsLength(a, b) {
  let best = 0;
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let prevDiag = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prevDiag + 1 : 0;
      if (row[j] > best) best = row[j];
      prevDiag = temp;
    }
  }
  return best;
}

// Two tokens count as the same word when they share a long enough core.
// Affix stripping alone is not enough: Arabic derives forms by INFIX as well
// as by prefix, so "يكلم" and "يتكلم" (forms II and V of the same root) stay
// different strings no matter what you shave off the ends — and a patient
// re-telling the fact they asked to forget will naturally use a different
// form. This caught a real miss on live data.
const CORE_MIN = 3;
function tokenMatches(a, b) {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  const core = lcsLength(a, b);
  return core >= CORE_MIN && core / shorter >= MATCH_THRESHOLD;
}

/**
 * Does `line` say what one of the forgotten bags said? Asymmetric on purpose:
 * we measure how much of the NEW line the bag covers, so a rephrased,
 * expanded restatement of a forgotten fact still matches. Erring towards
 * dropping a line costs the companion a little context; erring the other way
 * breaks a promise made to a psychiatric patient about their own record.
 */
function isForgotten(line, forgotten) {
  const tokens = tokensOf(line);
  if (tokens.length < MIN_TOKENS) return false;
  return forgotten.some((bag) => {
    if (bag.length < MIN_TOKENS) return false;
    const covered = tokens.filter((tk) => bag.some((b) => tokenMatches(tk, b))).length;
    return covered / tokens.length >= MATCH_THRESHOLD;
  });
}

/** Filter a freshly generated summary through the patient's forget list. */
function applyForgotten(summary, forgotten) {
  if (!forgotten?.length) return String(summary || '');
  return splitLines(summary)
    .filter((l) => !isForgotten(l.text, forgotten))
    .map((l) => l.text)
    .join(' ');
}

const forgottenOf = (state) => (Array.isArray(state?.forgotten) ? state.forgotten : []);

const remember = (forgotten, text) => {
  const bag = tokensOf(text);
  if (bag.length < MIN_TOKENS) return forgotten; // too thin to match safely
  return [...forgotten, bag].slice(-MAX_FORGOTTEN);
};

// --- patient-facing operations -------------------------------------------------
// All of them are read-only w.r.t. the thread itself: editing the memory never
// touches ai_messages. The transcript is the patient's own words and stays as
// written; what changes is what the companion *carries forward* about them.

/** The memory as the patient sees it. Never creates a thread. */
async function memoryFor(user) {
  const conversation = await repos.getAiConversation(user.id);
  if (!conversation) return { exists: false, lines: [], topics: [], updatedAt: null, editedAt: null };
  const state = await repos.getAiState(conversation.id);
  return {
    exists: true,
    lines: splitLines(state?.summary),
    topics: Array.isArray(state?.topics) ? state.topics : [],
    updatedAt: state?.updatedAt || null,
    editedAt: state?.editedAt || null,
    // How many things the companion has been told to forget. The count, not
    // the content: showing the list back would defeat the point of the ask.
    forgottenCount: forgottenOf(state).length,
  };
}

/**
 * The patient rewrites the memory in their own words. Their text is stored
 * verbatim and NOTHING is added to the forget list: a correction ("I see my
 * brother less often", replacing "he stopped seeing his brother") must not
 * install a filter that would then delete the correction. Rewriting is
 * authorship; forgetting is a separate, explicit act.
 */
async function replaceMemory(user, text) {
  const conversation = await repos.getAiConversation(user.id);
  if (!conversation) return null;
  const summary = String(text || '').trim().slice(0, MAX_SUMMARY_CHARS);
  await repos.upsertAiState(conversation.id, { summary, editedAt: new Date().toISOString() });
  return memoryFor(user);
}

/** One-tap forget: the line goes, and stays gone across future refreshes. */
async function forgetLine(user, id) {
  const conversation = await repos.getAiConversation(user.id);
  if (!conversation) return null;
  const state = await repos.getAiState(conversation.id);
  const lines = splitLines(state?.summary);
  const target = lines.find((l) => l.id === id);
  if (!target) return { notFound: true };

  await repos.upsertAiState(conversation.id, {
    summary: lines.filter((l) => l.id !== id).map((l) => l.text).join(' '),
    forgotten: remember(forgottenOf(state), target.text),
    editedAt: new Date().toISOString(),
  });
  return memoryFor(user);
}

/**
 * Forget everything. The thread itself is untouched — DELETE /api/ai/history
 * is the bigger hammer and has its own crisis-hold guard. This clears what
 * the companion carries: summary, topics, detected emotion, and the
 * home-screen follow-up derived from all three.
 */
async function forgetAll(user) {
  const conversation = await repos.getAiConversation(user.id);
  if (!conversation) return null;
  const state = await repos.getAiState(conversation.id);
  let forgotten = forgottenOf(state);
  for (const line of splitLines(state?.summary)) forgotten = remember(forgotten, line.text);

  await repos.upsertAiState(conversation.id, {
    summary: '', topics: [], clearEmotion: true, followUp: '',
    forgotten, editedAt: new Date().toISOString(),
  });
  return memoryFor(user);
}

module.exports = {
  memoryFor, replaceMemory, forgetLine, forgetAll,
  // exported for the summariser and its tests
  applyForgotten, splitLines, tokensOf, isForgotten, lineId,
  MAX_SUMMARY_CHARS,
};
