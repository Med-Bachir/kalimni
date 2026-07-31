// Wellness levels.
//
// One number that folds together everything the patient has done: check-ins
// from the server, calm sessions, quests, and journal notes. The garden tiers
// and the journey milestones both already exist and both stay — they answer
// narrower questions ("how planted is my garden", "how many check-ins"). This
// is the headline, the single "where am I" the other two ladder into.
//
// Named "wellness level" because that is what it is called in the product, but
// note carefully what it does NOT measure: it is not a score of how well the
// patient is. Mood, stress, sleep and questionnaire severity contribute
// nothing. A person whose depression is unchanged after six months still
// climbs this ladder at full speed, because the ladder measures showing up.
//
// Tying a visible level to symptom improvement would be actively harmful: it
// would rank patients by how sick they are, and stall exactly when someone
// needs encouragement most. If a future version wants to surface improvement,
// that belongs in the clinician-facing trend charts, not in a level badge.

// Thresholds are front-loaded: level 2 arrives in the first few days, and the
// gaps widen later. Early momentum is what gets someone past week one; by the
// time the gaps are large the app is a habit and does not need the pull.
export const LEVELS = [
  { level: 1,  at: 0,   icon: 'egg-outline' },
  { level: 2,  at: 5,   icon: 'leaf-outline' },
  { level: 3,  at: 15,  icon: 'flower-outline' },
  { level: 4,  at: 30,  icon: 'sunny-outline' },
  { level: 5,  at: 55,  icon: 'partly-sunny-outline' },
  { level: 6,  at: 90,  icon: 'water-outline' },
  { level: 7,  at: 140, icon: 'moon-outline' },
  { level: 8,  at: 220, icon: 'star-outline' },
  { level: 9,  at: 350, icon: 'planet-outline' },
  { level: 10, at: 550, icon: 'infinite-outline' },
];

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level;

/**
 * Total points from every source. Journal notes are worth two because writing
 * one is genuinely harder than tapping a quest, and the whole point of the
 * "reward journaling" brief is that the harder thing should pay more.
 */
export const pointsFrom = ({ checkins = 0, growth = 0, notes = 0 } = {}) => {
  const num = (v) => Math.max(0, Number(v) || 0);
  // `growth` already includes quests and calm sessions — the calm store adds a
  // point for each — so quests must NOT be added again here.
  return num(checkins) + num(growth) + num(notes) * 2;
};

/**
 * Where a point total sits on the ladder.
 *
 * Always returns a level: there is no "unranked" state, because arriving at an
 * app that says you are nothing yet is a bad first screen. Everyone starts at 1.
 */
export function levelFor(points) {
  const total = Math.max(0, Number(points) || 0);

  let reached = LEVELS[0];
  let next = null;
  for (const entry of LEVELS) {
    if (entry.at <= total) reached = entry;
    else { next = entry; break; }
  }

  const span = next ? next.at - reached.at : 0;
  return {
    total,
    level: reached.level,
    icon: reached.icon,
    next,
    remaining: next ? next.at - total : 0,
    progress: next && span > 0 ? (total - reached.at) / span : 1,
    max: !next,
  };
}

// True exactly on a threshold — the moment worth a chime, checked against a
// freshly computed total after any action that awards points.
export const isLevelUp = (points) => LEVELS.some((l) => l.at === Math.max(0, Number(points) || 0) && l.at > 0);
