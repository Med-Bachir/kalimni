// The spirit animal: the companion that lives in the app.
//
// It is chosen by a short quiz, and the quiz is deliberately NOT clinical. The
// intake questionnaires in this app are GAD-7 and PHQ-9 — real instruments with
// real severity bands — and handing someone an animal because they scored
// "severe" would turn a screening tool into a horoscope, and turn a diagnosis
// into a mascot. So the questions below ask about temperament and preference:
// where you stand in a room, what rest sounds like, what people get wrong about
// you. Nobody can score badly on them.
//
// The same rule as calmData.js applies: the spirit cannot be lost, cannot be
// disappointed in you, does not need feeding, and never leaves. It is company,
// not a tamagotchi — an animal that dies when you stop opening the app is a
// guilt machine aimed at exactly the wrong person.

/**
 * Twelve archetypes. Each is drawn from plain Views by
 * components/SpiritAnimal.js (no SVG dependency, so the whole cast ships over
 * EAS Update), which is why every entry carries a palette and a set of feature
 * flags rather than an asset path.
 *
 * `palette.iris` is what carries most of the realism: a solid black oval reads
 * as a cartoon, an iris with a pupil and a rim reads as an eye.
 *
 * `trait` keys into i18n at spirit.animals.<id>.*
 */
export const SPIRITS = [
  {
    id: 'owl',
    // the observer — thinks its way around everything, including itself
    palette: {
      body: '#A98D6F', dark: '#8A7057', deep: '#6E5942', belly: '#EBDCC6',
      accent: '#C6AC8B', aura: '#DDBB94', iris: '#E0A63C',
    },
    features: { ears: 'tufts', muzzle: 'beak', tail: 'fan', markings: 'chest', fur: 'feather' },
    build: { headRatio: 0.68, bodyRatio: 0.72, eyeRatio: 0.22, eyeGap: 0.25, neck: 0 },
  },
  {
    id: 'deer',
    // the sensitive one — feels everything first, and a little too much
    palette: {
      body: '#C79A72', dark: '#A87C57', deep: '#8A6242', belly: '#F0DEC8',
      accent: '#E8CBA8', aura: '#E8A87C', iris: '#4A3524',
    },
    features: { ears: 'long', muzzle: 'snout', tail: 'tuft', markings: 'spots', fur: 'smooth' },
    build: { headRatio: 0.6, bodyRatio: 0.62, eyeRatio: 0.19, eyeGap: 0.22, neck: 0.18 },
  },
  {
    id: 'fox',
    // the adaptive one — quick, curious, rarely still
    palette: {
      body: '#D98E5A', dark: '#B96F3E', deep: '#96552C', belly: '#F5E3D0',
      accent: '#F0B183', aura: '#E8A87C', iris: '#B77A2E',
    },
    features: { ears: 'pointed', muzzle: 'snout', tail: 'bushy', markings: 'none', fur: 'tufted' },
    build: { headRatio: 0.63, bodyRatio: 0.66, eyeRatio: 0.19, eyeGap: 0.23, neck: 0 },
  },
  {
    id: 'turtle',
    // the steady one — slow on purpose, and carries its own shelter
    palette: {
      body: '#7FB08A', dark: '#5E9370', deep: '#47765A', belly: '#DDEBDD',
      accent: '#A5C8AF', aura: '#8FBCCB', iris: '#3E6B4F',
    },
    features: { ears: 'none', muzzle: 'round', tail: 'stub', markings: 'shell', fur: 'smooth' },
    build: { headRatio: 0.5, bodyRatio: 0.9, eyeRatio: 0.17, eyeGap: 0.2, neck: 0.14 },
  },
  {
    id: 'cat',
    // the self-reliant one — soothes itself, keeps a door open behind it
    palette: {
      body: '#8D93A8', dark: '#6F7690', deep: '#585E76', belly: '#E4E7EF',
      accent: '#B0B5C6', aura: '#B9B1DC', iris: '#5FA36F',
    },
    features: { ears: 'pointed', muzzle: 'round', tail: 'curl', markings: 'stripes', fur: 'tufted' },
    build: { headRatio: 0.63, bodyRatio: 0.64, eyeRatio: 0.2, eyeGap: 0.23, neck: 0 },
  },
  {
    id: 'bear',
    // the protector — checks on everyone else before it checks on itself
    palette: {
      body: '#9C8574', dark: '#7C6857', deep: '#61503F', belly: '#E9DCCB',
      accent: '#BBA391', aura: '#DDBB94', iris: '#4A3524',
    },
    features: { ears: 'round', muzzle: 'round', tail: 'stub', markings: 'none', fur: 'shaggy' },
    build: { headRatio: 0.66, bodyRatio: 0.82, eyeRatio: 0.18, eyeGap: 0.22, neck: 0 },
  },
  {
    id: 'rabbit',
    // the alert one — hears it coming long before it arrives
    palette: {
      body: '#C9BCAE', dark: '#A99B8C', deep: '#8A7C6D', belly: '#F4EDE3',
      accent: '#E3CFC4', aura: '#DDBB94', iris: '#7A4A3A',
    },
    features: { ears: 'tall', muzzle: 'round', tail: 'puff', markings: 'none', fur: 'tufted' },
    build: { headRatio: 0.62, bodyRatio: 0.66, eyeRatio: 0.22, eyeGap: 0.24, neck: 0 },
  },
  {
    id: 'wolf',
    // the loyal one — built for a pack, and often without one
    palette: {
      body: '#8A8F96', dark: '#6B7078', deep: '#53585F', belly: '#E2E5E9',
      accent: '#A9AEB6', aura: '#9DB2BF', iris: '#C6A63C',
    },
    features: { ears: 'pointed', muzzle: 'snout', tail: 'bushy', markings: 'saddle', fur: 'shaggy' },
    build: { headRatio: 0.62, bodyRatio: 0.74, eyeRatio: 0.18, eyeGap: 0.24, neck: 0.08 },
  },
  {
    id: 'hedgehog',
    // the guarded one — defends first, and explains later if at all
    palette: {
      body: '#B99C7E', dark: '#6E5B49', deep: '#4E4034', belly: '#F0E3D2',
      accent: '#8C7560', aura: '#DDBB94', iris: '#3B2E24',
    },
    features: { ears: 'small', muzzle: 'snout', tail: 'stub', markings: 'spikes', fur: 'smooth' },
    build: { headRatio: 0.58, bodyRatio: 0.8, eyeRatio: 0.17, eyeGap: 0.19, neck: 0 },
  },
  {
    id: 'otter',
    // the playful one — finds the lightness, sometimes to avoid the weight
    palette: {
      body: '#9C7B5E', dark: '#7C6047', deep: '#614A36', belly: '#EFDCC4',
      accent: '#BC9A79', aura: '#8FBCCB', iris: '#4A3524',
    },
    features: { ears: 'small', muzzle: 'round', tail: 'thick', markings: 'none', fur: 'smooth' },
    build: { headRatio: 0.6, bodyRatio: 0.72, eyeRatio: 0.2, eyeGap: 0.22, neck: 0.1 },
  },
  {
    id: 'crane',
    // the composed one — still on the surface, working hard underneath
    palette: {
      body: '#E4E6EA', dark: '#C0C5CD', deep: '#9AA1AC', belly: '#FFFFFF',
      accent: '#D6DAE1', aura: '#CDEBE3', iris: '#3E5566',
    },
    features: { ears: 'none', muzzle: 'longbeak', tail: 'plume', markings: 'crown', fur: 'feather' },
    build: { headRatio: 0.46, bodyRatio: 0.68, eyeRatio: 0.16, eyeGap: 0.2, neck: 0.52 },
  },
  {
    id: 'squirrel',
    // the preparer — stores against a winter that may not come
    palette: {
      body: '#B57F55', dark: '#94623B', deep: '#754B2B', belly: '#F2E2CC',
      accent: '#D3A277', aura: '#DDBB94', iris: '#3B2E24',
    },
    features: { ears: 'tufts', muzzle: 'snout', tail: 'plume', markings: 'none', fur: 'tufted' },
    build: { headRatio: 0.6, bodyRatio: 0.6, eyeRatio: 0.21, eyeGap: 0.22, neck: 0 },
  },
];

export const spiritById = (id) => SPIRITS.find((s) => s.id === id) || SPIRITS[0];

/**
 * Seven questions, four options each. Every option leans toward exactly two
 * animals with equal weight, so no single answer decides the result and no
 * option is a dead end.
 *
 * BALANCE — this is the part that breaks quietly if edited carelessly. With
 * twelve animals and 28 options, each animal appears as a lean on four or five
 * of them, and no two animals share more than two options. Both properties
 * matter: an animal that appears twice can essentially never win, and two
 * animals that share four options will tie constantly and resolve by array
 * order, which silently makes one of them unreachable.
 *
 * Text lives in i18n at spirit.quiz.<questionId>.q and .<optionKey>.
 */
export const SPIRIT_QUIZ = [
  {
    id: 'gathering',
    options: [
      { key: 'a', weights: { owl: 2, hedgehog: 2 } },
      { key: 'b', weights: { fox: 2, otter: 2 } },
      { key: 'c', weights: { deer: 2, wolf: 2 } },
      { key: 'd', weights: { turtle: 2, cat: 2 } },
    ],
  },
  {
    id: 'heavy',
    options: [
      { key: 'a', weights: { owl: 2, squirrel: 2 } },
      { key: 'b', weights: { hedgehog: 2, turtle: 2 } },
      { key: 'c', weights: { fox: 2, rabbit: 2 } },
      { key: 'd', weights: { bear: 2, crane: 2 } },
    ],
  },
  {
    id: 'rest',
    options: [
      // Was { owl, crane }, which put the owl in five options against every
      // other animal's four and made it win 14% of all possible quizzes. The
      // otter is also the better read on rain and water.
      { key: 'a', weights: { otter: 2, crane: 2 } },
      { key: 'b', weights: { cat: 2, hedgehog: 2 } },
      { key: 'c', weights: { deer: 2, rabbit: 2 } },
      { key: 'd', weights: { bear: 2, wolf: 2 } },
    ],
  },
  {
    id: 'friend',
    options: [
      { key: 'a', weights: { bear: 2, turtle: 2 } },
      { key: 'b', weights: { owl: 2, squirrel: 2 } },
      { key: 'c', weights: { otter: 2, fox: 2 } },
      { key: 'd', weights: { deer: 2, rabbit: 2 } },
    ],
  },
  {
    id: 'place',
    options: [
      { key: 'a', weights: { deer: 2, wolf: 2 } },
      { key: 'b', weights: { turtle: 2, crane: 2 } },
      { key: 'c', weights: { cat: 2, owl: 2 } },
      { key: 'd', weights: { fox: 2, squirrel: 2 } },
    ],
  },
  {
    id: 'unknown',
    options: [
      { key: 'a', weights: { squirrel: 2, crane: 2 } },
      { key: 'b', weights: { rabbit: 2, hedgehog: 2 } },
      { key: 'c', weights: { otter: 2, cat: 2 } },
      { key: 'd', weights: { turtle: 2, bear: 2 } },
    ],
  },
  {
    id: 'seen',
    options: [
      { key: 'a', weights: { crane: 2, cat: 2 } },
      { key: 'b', weights: { hedgehog: 2, wolf: 2 } },
      { key: 'c', weights: { wolf: 2, bear: 2 } },
      { key: 'd', weights: { otter: 2, rabbit: 2 } },
    ],
  },
];

/**
 * `answers` is an array of option keys, one per question, in quiz order.
 * Returns the winning spirit id.
 *
 * TIE-BREAKING, which is more load-bearing than it looks. Every option carries
 * the same weight, so exact ties are common — and the obvious implementation
 * (`if (score > best)` scanning the array) silently hands every one of them to
 * SPIRITS[0]. Measured across all 4^7 combinations that made the owl win 14.7%
 * of quizzes while the otter won 3.3%: the first entry in the list becomes the
 * house favourite, and nobody reading the code would ever see it.
 *
 * So ties are resolved in two stages:
 *   1. a decreasing epsilon per question, so an animal that scored from an
 *      earlier answer edges out one that scored later
 *   2. anything still exactly level is picked by hashing the answers, which is
 *      deterministic (the same answers always give the same animal, so a
 *      re-take is not a slot machine) but carries no ordering bias
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

  let bestScore = -1;
  SPIRITS.forEach((s) => {
    bestScore = Math.max(bestScore, scores[s.id] || 0);
  });

  const leaders = SPIRITS.filter((s) => (scores[s.id] || 0) >= bestScore - 1e-9).map((s) => s.id);
  if (leaders.length <= 1) return leaders[0] || SPIRITS[0].id;

  const seed = answers.join('');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return leaders[Math.abs(hash) % leaders.length];
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
