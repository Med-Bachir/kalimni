// The spirit animal: the companion that sits at the top of the chat.
//
// It is chosen by a short quiz, and the quiz is deliberately NOT clinical. The
// intake questionnaires in this app are GAD-7 and PHQ-9 — real instruments with
// real severity bands — and handing someone an animal because they scored
// "severe" would turn a screening tool into a horoscope, and turn a diagnosis
// into a mascot. So the five questions below ask about temperament and
// preference: where you stand in a room, what rest sounds like, where you'd go
// to breathe. Nobody can score badly on them.
//
// The same rule as calmData.js applies: the spirit cannot be lost, cannot be
// disappointed in you, does not need feeding, and never leaves. It is company,
// not a tamagotchi — an animal that dies when you stop opening the app is a
// guilt machine aimed at exactly the wrong person.

/**
 * Six archetypes. Each is drawn from plain Views by components/SpiritAnimal.js
 * (no SVG dependency, so it ships over EAS Update), which is why every entry
 * carries a palette and a set of feature flags rather than an asset path.
 *
 * `trait` keys into i18n at spirit.animals.<id>.*
 */
export const SPIRITS = [
  {
    id: 'owl',
    // the observer — thinks its way around everything, including itself
    palette: { body: '#A98D6F', dark: '#8A7057', belly: '#EBDCC6', accent: '#C6AC8B', aura: '#DDBB94' },
    features: { ears: 'tufts', muzzle: 'beak', tail: 'fan', markings: 'chest' },
    build: { headRatio: 0.62, bodyRatio: 0.72, eyeRatio: 0.19, eyeGap: 0.24 },
  },
  {
    id: 'deer',
    // the sensitive one — feels everything first, and a little too much
    palette: { body: '#C79A72', dark: '#A87C57', belly: '#F0DEC8', accent: '#E8CBA8', aura: '#E8A87C' },
    features: { ears: 'long', muzzle: 'snout', tail: 'tuft', markings: 'spots' },
    build: { headRatio: 0.52, bodyRatio: 0.62, eyeRatio: 0.15, eyeGap: 0.2 },
  },
  {
    id: 'fox',
    // the adaptive one — quick, curious, rarely still
    palette: { body: '#D98E5A', dark: '#B96F3E', belly: '#F5E3D0', accent: '#F0B183', aura: '#E8A87C' },
    features: { ears: 'pointed', muzzle: 'snout', tail: 'bushy', markings: 'none' },
    build: { headRatio: 0.56, bodyRatio: 0.66, eyeRatio: 0.14, eyeGap: 0.22 },
  },
  {
    id: 'turtle',
    // the steady one — slow on purpose, and carries its own shelter
    palette: { body: '#7FB08A', dark: '#5E9370', belly: '#DDEBDD', accent: '#A5C8AF', aura: '#8FBCCB' },
    features: { ears: 'none', muzzle: 'round', tail: 'stub', markings: 'shell' },
    build: { headRatio: 0.42, bodyRatio: 0.9, eyeRatio: 0.12, eyeGap: 0.18 },
  },
  {
    id: 'cat',
    // the self-reliant one — soothes itself, keeps a door open behind it
    palette: { body: '#8D93A8', dark: '#6F7690', belly: '#E4E7EF', accent: '#B0B5C6', aura: '#B9B1DC' },
    features: { ears: 'pointed', muzzle: 'round', tail: 'curl', markings: 'stripes' },
    build: { headRatio: 0.56, bodyRatio: 0.64, eyeRatio: 0.15, eyeGap: 0.22 },
  },
  {
    id: 'bear',
    // the protector — checks on everyone else before it checks on itself
    palette: { body: '#9C8574', dark: '#7C6857', belly: '#E9DCCB', accent: '#BBA391', aura: '#DDBB94' },
    features: { ears: 'round', muzzle: 'round', tail: 'stub', markings: 'none' },
    build: { headRatio: 0.6, bodyRatio: 0.82, eyeRatio: 0.13, eyeGap: 0.21 },
  },
];

export const spiritById = (id) => SPIRITS.find((s) => s.id === id) || SPIRITS[0];

/**
 * Five questions, four options each. Every option leans toward two animals, so
 * no single answer decides the result and no option is a dead end.
 *
 * Text lives in i18n at spirit.quiz.<questionId>.q and .<optionKey>.
 */
export const SPIRIT_QUIZ = [
  {
    id: 'gathering',
    options: [
      { key: 'a', weights: { owl: 2, cat: 1 } },
      { key: 'b', weights: { fox: 2, deer: 1 } },
      { key: 'c', weights: { deer: 2, bear: 1 } },
      { key: 'd', weights: { turtle: 2, cat: 2 } },
    ],
  },
  {
    id: 'heavy',
    options: [
      { key: 'a', weights: { owl: 2, fox: 1 } },
      { key: 'b', weights: { turtle: 2, cat: 1 } },
      { key: 'c', weights: { fox: 2, bear: 1 } },
      { key: 'd', weights: { bear: 2, deer: 1 } },
    ],
  },
  {
    id: 'rest',
    options: [
      { key: 'a', weights: { owl: 2, turtle: 1 } },
      { key: 'b', weights: { cat: 2, turtle: 1 } },
      { key: 'c', weights: { deer: 2, fox: 1 } },
      { key: 'd', weights: { bear: 2, owl: 1 } },
    ],
  },
  {
    id: 'friend',
    options: [
      { key: 'a', weights: { bear: 2, deer: 1 } },
      { key: 'b', weights: { owl: 2, fox: 1 } },
      { key: 'c', weights: { fox: 2, cat: 2 } },
      { key: 'd', weights: { deer: 2, turtle: 1 } },
    ],
  },
  {
    id: 'place',
    options: [
      { key: 'a', weights: { deer: 2, owl: 1 } },
      { key: 'b', weights: { turtle: 2, bear: 1 } },
      { key: 'c', weights: { cat: 2, owl: 1 } },
      { key: 'd', weights: { fox: 2, deer: 1 } },
    ],
  },
];

/**
 * `answers` is an array of option keys, one per question, in quiz order.
 * Returns the winning spirit id.
 *
 * Ties are broken by which animal scored earliest, via a decreasing epsilon per
 * question — never by array order, which would quietly make the first entry in
 * SPIRITS the default answer for every indecisive person.
 */
export function spiritFor(answers = []) {
  const scores = {};
  SPIRIT_QUIZ.forEach((question, qi) => {
    const option = question.options.find((o) => o.key === answers[qi]);
    if (!option) return;
    const epsilon = (SPIRIT_QUIZ.length - qi) * 1e-3;
    Object.entries(option.weights).forEach(([id, weight]) => {
      scores[id] = (scores[id] || 0) + weight + epsilon;
    });
  });

  let best = null;
  let bestScore = -1;
  SPIRITS.forEach((s) => {
    const score = scores[s.id] || 0;
    if (score > bestScore) {
      best = s.id;
      bestScore = score;
    }
  });
  return best || SPIRITS[0].id;
}

/**
 * How settled the spirit looks, from the same growth points that grow the
 * garden. Purely cosmetic — a brighter aura and a few more motes — and, like
 * everything else in the Calm Corner, it only ever goes up.
 */
export const SPIRIT_STAGES = [0, 6, 20, 45];

export function spiritStage(points = 0) {
  const safe = Math.max(0, Math.floor(points) || 0);
  let stage = 0;
  SPIRIT_STAGES.forEach((at, i) => {
    if (safe >= at) stage = i;
  });
  return stage;
}

// What the spirit says above the chat. Rotated by day so it is not the same
// sentence forever, but deterministic within a day so it does not flicker on
// every re-render. Keys into i18n at spirit.lines.<id>.<n>.
export const SPIRIT_LINE_COUNT = 4;

export function spiritLineIndex(dayString) {
  let hash = 0;
  for (let i = 0; i < dayString.length; i++) hash = (hash * 31 + dayString.charCodeAt(i)) | 0;
  return Math.abs(hash) % SPIRIT_LINE_COUNT;
}
