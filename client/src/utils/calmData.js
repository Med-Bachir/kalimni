// Static data for the Calm Corner. Everything here is content-shaped, not
// logic-shaped: the copy lives in i18n and this file only holds the ids,
// icons, palettes and the small amount of maths the screens share.
//
// One rule governs the whole folder, and it is the same rule as
// utils/milestones.js: nothing here can ever be lost, expire, wilt or reset.
// A garden that dies when you stop watering it is a guilt machine aimed at
// precisely the person who most needed a reason to come back.

// --- mood as weather --------------------------------------------------------
//
// The 1-5 numeric scale stays the wire format — the server, the trend chart and
// every stored entry are unchanged. This is purely how the number is *asked
// for*. "Which sky is today?" is a question a flattened person can answer;
// "rate your mood from 1 to 5" is a form.

export const WEATHER = [
  { value: 1, key: 'storm',  icon: 'thunderstorm', sky: ['#5C6B78', '#8595A2'] },
  { value: 2, key: 'rain',   icon: 'rainy',        sky: ['#7C93A3', '#A9BECB'] },
  { value: 3, key: 'cloud',  icon: 'cloudy',       sky: ['#9DB2BF', '#C9D8E1'] },
  { value: 4, key: 'partly', icon: 'partly-sunny', sky: ['#A8C4D2', '#DCE9EF'] },
  { value: 5, key: 'sun',    icon: 'sunny',        sky: ['#BFD9E5', '#F0E3CB'] },
];

export const weatherFor = (value) =>
  WEATHER.find((w) => w.value === value) || WEATHER[2];

// --- grounding: 5-4-3-2-1 ---------------------------------------------------
//
// The classic sensory grounding exercise. Counts descend, which matters: the
// exercise gets easier as attention returns, never harder.

export const GROUNDING_STEPS = [
  { key: 'see',   count: 5, icon: 'eye-outline' },
  { key: 'touch', count: 4, icon: 'hand-left-outline' },
  { key: 'hear',  count: 3, icon: 'ear-outline' },
  { key: 'smell', count: 2, icon: 'flower-outline' },
  { key: 'taste', count: 1, icon: 'cafe-outline' },
];

// --- thought-trap cards -----------------------------------------------------
//
// Ten common cognitive distortions, each as a flip card: the thought on the
// front, the name of the trap and a kinder rewrite on the back. Recognising the
// *shape* of a thought is the skill; these are training wheels for it.
//
// Ordered roughly from most to least common in low mood, so the first cards a
// new user meets are the ones most likely to land.

export const REFRAME_CARDS = [
  { id: 'allOrNothing', icon: 'contrast-outline' },
  { id: 'mindReading',  icon: 'eye-off-outline' },
  { id: 'catastrophe',  icon: 'trending-down-outline' },
  { id: 'shoulds',      icon: 'alert-circle-outline' },
  { id: 'labelling',    icon: 'pricetag-outline' },
  { id: 'filtering',    icon: 'funnel-outline' },
  { id: 'personalise',  icon: 'person-outline' },
  { id: 'fortune',      icon: 'help-circle-outline' },
  { id: 'feelingsFact', icon: 'heart-dislike-outline' },
  { id: 'discounting',  icon: 'remove-circle-outline' },
];

// --- kindness quests --------------------------------------------------------
//
// Twelve tiny, genuinely achievable actions. The bar is set at "possible on a
// bad day" on purpose — a quest you cannot do on your worst day is a quest that
// teaches you the app is for other people.
//
// Three are offered per day. There is no penalty for ignoring them, no timer,
// and yesterday's untouched quests simply never come up again.

export const QUESTS = [
  { id: 'water',    icon: 'water-outline' },
  { id: 'outside',  icon: 'partly-sunny-outline' },
  { id: 'message',  icon: 'chatbubble-outline' },
  { id: 'stretch',  icon: 'body-outline' },
  { id: 'window',   icon: 'browsers-outline' },
  { id: 'song',     icon: 'musical-notes-outline' },
  { id: 'tidyOne',  icon: 'cube-outline' },
  { id: 'shower',   icon: 'rainy-outline' },
  { id: 'eat',      icon: 'restaurant-outline' },
  { id: 'thankOne', icon: 'happy-outline' },
  { id: 'sitStill', icon: 'leaf-outline' },
  { id: 'photo',    icon: 'camera-outline' },
];

const QUESTS_PER_DAY = 3;

// Local date key — not UTC. A day boundary that moves with the timezone is the
// only one a person actually experiences.
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hashOf = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/**
 * The three quests for a given day. Deterministic from the date, so the list is
 * stable if the app is reopened, and identical after a reinstall — no server
 * round trip and nothing to lose.
 */
export function questsFor(key = dayKey()) {
  const seed = hashOf(key);
  const picked = [];
  for (let i = 0; picked.length < QUESTS_PER_DAY && i < QUESTS.length * 3; i++) {
    const quest = QUESTS[(seed + i * 7) % QUESTS.length];
    if (!picked.includes(quest)) picked.push(quest);
  }
  return picked;
}

// --- collectible skies ------------------------------------------------------
//
// The reward for quests is a piece of calm art, not a number going up. Each is
// a gradient "sky" that unlocks permanently at a cumulative quest count and is
// then usable as the garden's backdrop.

export const SKIES = [
  { id: 'dawn',     at: 0,  colors: ['#F3E5D8', '#DDBB94'] },
  { id: 'morning',  at: 3,  colors: ['#DCE9EF', '#A8C4D2'] },
  { id: 'noon',     at: 8,  colors: ['#CFE6F2', '#8FBCCB'] },
  { id: 'rainy',    at: 15, colors: ['#C4D2DA', '#7C93A3'] },
  { id: 'dusk',     at: 24, colors: ['#EDEAF6', '#B9B1DC'] },
  { id: 'night',    at: 35, colors: ['#3A4E60', '#1C3040'] },
  // Aurora is a NIGHT sky, and used to be a pale mint gradient. Bands of light
  // over a daytime blue read as coloured smudges, not an aurora — the whole
  // effect depends on glow against darkness. Darkened when the drifting
  // curtains were added in Garden.js; the pale mint moved into the light
  // itself, where it belongs.
  { id: 'aurora',   at: 50, colors: ['#16323E', '#0D1F2A'] },
  { id: 'firstSun', at: 70, colors: ['#F7E1C9', '#E8A87C'] },
];

export const skiesUnlocked = (completed) => SKIES.filter((s) => s.at <= completed);

export const skyById = (id) => SKIES.find((s) => s.id === id) || SKIES[0];

// --- the garden -------------------------------------------------------------
//
// Growth points come from anything that counts as showing up: a check-in, a
// breathing session, a grounding round, a completed quest. The garden fills to
// GARDEN_CAPACITY plants, and past that the whole garden matures a tier instead
// of sprawling — so it always fits one screen and always still has somewhere to
// go.

export const GARDEN_CAPACITY = 18;
export const GARDEN_TIERS = 4; // sprout, bud, bloom, tree

/**
 * Both outputs are monotonic in `points`: more points never means fewer or
 * smaller plants. That property is the whole design, so it is asserted by the
 * test in the roadmap rather than left as a comment.
 */
export function gardenFor(points = 0) {
  const safe = Math.max(0, Math.floor(points) || 0);
  const plants = Math.min(safe, GARDEN_CAPACITY);
  const tier = Math.min(GARDEN_TIERS - 1, Math.floor(safe / GARDEN_CAPACITY));
  const nextTierAt = tier < GARDEN_TIERS - 1 ? (tier + 1) * GARDEN_CAPACITY : null;
  return {
    points: safe,
    plants,
    tier,
    nextTierAt,
    toNextTier: nextTierAt ? nextTierAt - safe : 0,
    // Full when the plot is planted and fully matured.
    complete: plants === GARDEN_CAPACITY && tier === GARDEN_TIERS - 1,
  };
}

// Per-plant palette. Index-derived so a given position keeps its colour as the
// garden grows around it.
export const PLANT_GREENS = [
  ['#7FB08A', '#5E9370'],
  ['#8CBE9B', '#6BA37E'],
  ['#A5C8AF', '#7FB08A'],
  ['#6FA383', '#4F8A67'],
];

export const BLOOMS = ['#E8A87C', '#DDBB94', '#B9B1DC', '#8FBCCB', '#E2A0A0', '#C9D48C'];
