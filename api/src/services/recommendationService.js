// Personalized content recommendations — "based on the patient's case".
// No dedicated table and no LLM cost: the case is computed live from what we
// already store, then matched against published content categories.
//
// Signals (strongest first):
//   1. Latest GAD-7 / PHQ-9 results (the clinical intake picture)
//   2. Recent daily check-ins (last 7 entries: sleep quality, stress)
//   3. AI companion state (dominant emotion from the rolling summary)
// Each signal adds weight to a content category; items are ranked by their
// category's weight. Every returned item carries a `reason` key so the UI can
// say WHY it was recommended. With no signals at all the list falls back to
// featured/newest items (reason 'general').
const repos = require('../data/repos');

const SEVERITY = { minimal: 0, mild: 1, moderate: 2, moderately_severe: 3, severe: 3 };

// emotion (ai_state) -> content category
const EMOTION_CATEGORY = {
  anxiety: 'anxiety', panic: 'anxiety', stress: 'exercises',
  sadness: 'growth', loneliness: 'growth', sleep: 'sleep', anger: 'exercises',
};

const MAX_ITEMS = 6;

/**
 * Returns { items: [{...contentItem, reason}], basis: {gad7, phq9, checkins, emotion} }
 * reason: 'anxiety' | 'mood' | 'sleep' | 'stress' | 'general'
 */
async function recommendFor(user) {
  const [results, checkins, conversation] = await Promise.all([
    repos.latestResultsByQuestionnaire(user.id),
    repos.journalEntriesOf(user.id, 7),
    repos.getOrCreateAiConversation(user.id),
  ]);
  const state = await repos.getAiState(conversation.id);

  // --- build category weights + the reason each weight came from -------------
  const weights = { anxiety: 0, sleep: 0, growth: 0, exercises: 0 };
  const reasons = { anxiety: null, sleep: null, growth: null, exercises: null };
  const bump = (category, amount, reason) => {
    weights[category] += amount;
    // Keep the strongest contributor as the displayed reason.
    if (!reasons[category] || amount > reasons[category].amount) {
      reasons[category] = { reason, amount };
    }
  };

  const basis = { gad7: null, phq9: null, checkins: checkins.length, emotion: state?.emotion || null };

  for (const r of results) {
    const severity = SEVERITY[r.level] ?? 0;
    if (r.questionnaireId === 'gad7') {
      basis.gad7 = r.level;
      if (severity >= 1) {
        bump('anxiety', 2 + severity, 'anxiety');
        bump('exercises', 1, 'anxiety');
      }
    }
    if (r.questionnaireId === 'phq9') {
      basis.phq9 = r.level;
      if (severity >= 1) bump('growth', 2 + severity, 'mood');
    }
  }

  if (checkins.length) {
    const avg = (key) => checkins.reduce((s, e) => s + e[key], 0) / checkins.length;
    if (avg('sleep') <= 2.5) bump('sleep', 3, 'sleep');
    if (avg('stress') >= 3.5) {
      bump('exercises', 2, 'stress');
      bump('anxiety', 1, 'stress');
    }
    if (avg('mood') <= 2.5) bump('growth', 2, 'mood');
  }

  const emotionCategory = EMOTION_CATEGORY[state?.emotion];
  if (emotionCategory) {
    const reason =
      state.emotion === 'sleep' ? 'sleep'
      : ['sadness', 'loneliness'].includes(state.emotion) ? 'mood'
      : ['anxiety', 'panic'].includes(state.emotion) ? 'anxiety'
      : 'stress';
    bump(emotionCategory, 2, reason);
  }

  // --- rank published content by its category weight --------------------------
  const items = await repos.listContent({});
  const hasSignal = Object.values(weights).some((w) => w > 0);

  const ranked = items
    .map((item) => ({
      item,
      score: (weights[item.category] || 0) + (item.featured ? 0.5 : 0),
    }))
    .filter((r) => (hasSignal ? r.score > 0.5 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ITEMS)
    .map((r) => ({
      ...r.item,
      reason: hasSignal ? reasons[r.item.category]?.reason || 'general' : 'general',
    }));

  return { items: ranked, basis };
}

module.exports = { recommendFor };
