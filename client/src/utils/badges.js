// Achievement badges.
//
// A badge is a permanent record that something happened. Nothing here can be
// lost, expire, or be taken back — the same rule the garden and the journey
// milestones already follow (see utils/milestones.js), for the same reason: a
// reward you can lose is a punishment with extra steps, and pointing one of
// those at someone who is depressed makes the app one more thing they are
// failing at.
//
// Three deliberate choices worth keeping if this list is ever rewritten:
//
//   1. NOTHING REWARDS FEELING BETTER. Not one badge tests mood > 3. A person
//      whose depression is not lifting must never watch someone else's app
//      hand out prizes they cannot earn. Every badge here is earned by showing
//      up, not by improving.
//
//   2. THE HARDEST DAYS PAY THE MOST. `showedUp` and `cameBack` fire exactly
//      when a habit tracker would be shaming the user — logging a 1/5 day, or
//      returning after a week away. That inversion is the whole point.
//
//   3. NO COMPARISON. No leaderboard, no percentile, no "you're in the top
//      10%". Badges are between the patient and the app.
//
// `test` receives the context built by badgeContext() below and returns a
// boolean. Keep them pure and cheap — they run on every relevant render.

export const BADGE_GROUPS = ['presence', 'calm', 'garden', 'spirit', 'resilience'];

export const BADGES = [
  // --- presence: showing up at all -----------------------------------------
  { id: 'firstStep',   group: 'presence', icon: 'footsteps-outline',   test: (c) => c.checkins >= 1 },
  { id: 'week',        group: 'presence', icon: 'calendar-outline',    test: (c) => c.daysPresent >= 7 },
  { id: 'month',       group: 'presence', icon: 'calendar-number-outline', test: (c) => c.daysPresent >= 30 },
  { id: 'hundred',     group: 'presence', icon: 'ribbon-outline',      test: (c) => c.daysPresent >= 100 },

  // --- journaling: the note field on the daily check-in --------------------
  { id: 'firstWords',  group: 'presence', icon: 'pencil-outline',      test: (c) => c.notes >= 1 },
  { id: 'tenPages',    group: 'presence', icon: 'book-outline',        test: (c) => c.notes >= 10 },
  { id: 'fiftyPages',  group: 'presence', icon: 'library-outline',     test: (c) => c.notes >= 50 },

  // --- calm corner: the exercises ------------------------------------------
  { id: 'firstBreath', group: 'calm', icon: 'ellipse-outline',   test: (c) => c.activities.breathing >= 1 },
  { id: 'grounded',    group: 'calm', icon: 'footsteps-outline', test: (c) => c.activities.grounding >= 1 },
  { id: 'popped',      group: 'calm', icon: 'water-outline',     test: (c) => c.activities.bubbles >= 1 },
  { id: 'reframed',    group: 'calm', icon: 'repeat-outline',    test: (c) => c.activities.reframe >= 1 },
  {
    id: 'explorer',
    group: 'calm',
    icon: 'compass-outline',
    test: (c) => ['breathing', 'grounding', 'bubbles', 'reframe'].every((k) => c.activities[k] >= 1),
  },
  { id: 'regular',     group: 'calm', icon: 'infinite-outline',  test: (c) => c.sessions >= 25 },
  { id: 'devoted',     group: 'calm', icon: 'diamond-outline',   test: (c) => c.sessions >= 100 },

  // --- quests ---------------------------------------------------------------
  { id: 'kindness',    group: 'calm', icon: 'sparkles-outline',  test: (c) => c.questsCompleted >= 10 },
  { id: 'kindness50',  group: 'calm', icon: 'star-outline',      test: (c) => c.questsCompleted >= 50 },

  // --- garden and skies -----------------------------------------------------
  { id: 'firstSprout', group: 'garden', icon: 'leaf-outline',    test: (c) => c.plants >= 1 },
  { id: 'halfGarden',  group: 'garden', icon: 'flower-outline',  test: (c) => c.plants >= Math.ceil(c.gardenCapacity / 2) },
  { id: 'fullGarden',  group: 'garden', icon: 'earth-outline',   test: (c) => c.plants >= c.gardenCapacity },
  { id: 'skyWatcher',  group: 'garden', icon: 'partly-sunny-outline', test: (c) => c.skies >= 4 },
  { id: 'allSkies',    group: 'garden', icon: 'planet-outline',  test: (c) => c.skies >= c.skyCount },

  // --- spirit animal --------------------------------------------------------
  { id: 'metSpirit',   group: 'spirit', icon: 'paw-outline',     test: (c) => c.spiritMet },
  { id: 'fedTen',      group: 'spirit', icon: 'nutrition-outline', test: (c) => c.bond >= 10 },
  { id: 'fedFifty',    group: 'spirit', icon: 'heart-outline',   test: (c) => c.bond >= 50 },

  // --- resilience: the ones that matter -------------------------------------
  //
  // These fire on the days a streak-based app would be punishing the user.
  // `showedUp` needs a check-in logged at mood 1 or 2 — opening the app on a
  // day that bad is harder than any thirty-day streak. `cameBack` needs a
  // return after three or more days away, which is precisely the event a
  // streak counter exists to punish.
  { id: 'showedUp',    group: 'resilience', icon: 'rainy-outline',   test: (c) => c.hardDays >= 1 },
  { id: 'showedUp10',  group: 'resilience', icon: 'umbrella-outline', test: (c) => c.hardDays >= 10 },
  { id: 'cameBack',    group: 'resilience', icon: 'return-down-back-outline', test: (c) => c.returns >= 1 },
  { id: 'stillHere',   group: 'resilience', icon: 'flame-outline',   test: (c) => c.bestRun >= 7 },
  { id: 'longGame',    group: 'resilience', icon: 'trail-sign-outline', test: (c) => c.bestRun >= 30 },
];

export const BADGE_COUNT = BADGES.length;

const byId = new Map(BADGES.map((b) => [b.id, b]));
export const badgeById = (id) => byId.get(id) || null;

/**
 * Assemble everything a badge test can ask about, from the three places state
 * actually lives: the server (check-ins), the calm store (device activity) and
 * the spirit store.
 *
 * Defensive about every field — this is fed by a network response that can be
 * absent, stale or partial, and a missing number must never unlock or revoke a
 * badge by accident.
 */
export function badgeContext({
  checkins = 0,
  notes = 0,
  activities = {},
  sessions = 0,
  questsCompleted = 0,
  plants = 0,
  gardenCapacity = 18,
  skies = 0,
  skyCount = 8,
  spiritMet = false,
  bond = 0,
  daysPresent = 0,
  bestRun = 0,
  returns = 0,
  hardDays = 0,
} = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    checkins: num(checkins),
    notes: num(notes),
    activities: {
      breathing: num(activities.breathing),
      grounding: num(activities.grounding),
      bubbles: num(activities.bubbles),
      reframe: num(activities.reframe),
    },
    sessions: num(sessions),
    questsCompleted: num(questsCompleted),
    plants: num(plants),
    gardenCapacity: Math.max(1, num(gardenCapacity)),
    skies: num(skies),
    skyCount: Math.max(1, num(skyCount)),
    spiritMet: !!spiritMet,
    bond: num(bond),
    daysPresent: num(daysPresent),
    bestRun: num(bestRun),
    returns: num(returns),
    hardDays: num(hardDays),
  };
}

/** Every badge id currently earned, in catalogue order. */
export function earnedBadges(context) {
  return BADGES.filter((b) => {
    try {
      return b.test(context);
    } catch {
      return false; // a broken test must not break the screen
    }
  }).map((b) => b.id);
}

/**
 * Badges earned now that were not in `known`.
 *
 * Only ever returns additions. If `known` somehow contains an id that no longer
 * evaluates true — a store rolled back, a catalogue edited between releases —
 * the badge stays earned. Once earned, always earned; see the header.
 */
export function newlyEarned(context, known = []) {
  const seen = new Set(known);
  return earnedBadges(context).filter((id) => !seen.has(id));
}
