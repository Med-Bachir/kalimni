import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayKey } from '../utils/calmData';
import { normaliseDays } from '../utils/presence';

const KEY = 'kalimni.calm';
const KEEP_DAYS = 7; // how much of the quest log is worth carrying around

const ACTIVITY_IDS = ['breathing', 'grounding', 'bubbles', 'reframe'];
const emptyActivities = () => Object.fromEntries(ACTIVITY_IDS.map((id) => [id, 0]));

// Everything the Calm Corner remembers, stored on the device only.
//
// Deliberately not on the server. None of it is clinical data, none of it is
// useful to a specialist, and a patient poking at a bubble-popping toy at 2am
// should not produce a row in a database someone else can read. The one number
// the specialist can already see — check-ins — keeps coming from the API.
//
// Writes are fire-and-forget: a failed AsyncStorage write costs a few growth
// points, and blocking a tap on disk I/O would cost more.

const emptyState = {
  growth: 0,          // lifetime growth points from calm activities
  questsCompleted: 0, // lifetime completed quests (drives sky unlocks)
  questLog: {},       // { 'YYYY-MM-DD': [questId, ...] }
  sky: 'dawn',

  // --- engagement ----------------------------------------------------------
  // All of it additive. There is no action in this store that decreases any of
  // these numbers, and none should ever be added; see the badge and presence
  // modules for why that constraint is load-bearing rather than stylistic.
  days: [],                     // 'YYYY-MM-DD' the patient did anything at all
  activities: emptyActivities(),// per-exercise completion counts
  notes: 0,                     // journal notes written with a check-in
  hardDays: 0,                  // check-ins logged at mood 1-2 — the bravest ones
  badges: [],                   // earned badge ids, never removed
  lineDay: null,                // last day the comfort line was dismissed
};

const prune = (log) => {
  const keys = Object.keys(log).sort().slice(-KEEP_DAYS);
  return Object.fromEntries(keys.map((k) => [k, log[k]]));
};

// Today, added to the presence log if it isn't already there.
//
// Returns the SAME array reference when today is already recorded — the common
// case, since most actions in a session happen on one day. zustand compares by
// reference, so returning the original prevents a needless re-render of every
// component subscribed to `days` on every quest tick.
const withToday = (days) => {
  const today = dayKey();
  return days.includes(today) ? days : normaliseDays([...days, today]);
};

export const useCalm = create((set, get) => ({
  ...emptyState,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        // Every field is read defensively and defaulted. This store predates
        // the engagement fields, so an install upgrading over an older build
        // arrives here with half of them missing — that must read as "zero so
        // far", never as a crash on launch.
        const activities = saved.activities && typeof saved.activities === 'object' ? saved.activities : {};
        set({
          growth: Number(saved.growth) || 0,
          questsCompleted: Number(saved.questsCompleted) || 0,
          questLog: prune(saved.questLog && typeof saved.questLog === 'object' ? saved.questLog : {}),
          sky: typeof saved.sky === 'string' ? saved.sky : 'dawn',

          days: normaliseDays(Array.isArray(saved.days) ? saved.days : []),
          activities: {
            ...emptyActivities(),
            ...Object.fromEntries(
              ACTIVITY_IDS.map((id) => [id, Math.max(0, Number(activities[id]) || 0)])
            ),
          },
          notes: Math.max(0, Number(saved.notes) || 0),
          hardDays: Math.max(0, Number(saved.hardDays) || 0),
          badges: Array.isArray(saved.badges) ? saved.badges.filter((b) => typeof b === 'string') : [],
          lineDay: typeof saved.lineDay === 'string' ? saved.lineDay : null,
        });
      }
    } catch {
      // Corrupt or unreadable: start fresh rather than crash the launch.
    }
    set({ hydrated: true });
  },

  // Persist whatever is current. Never awaited by a UI handler.
  persist: () => {
    const {
      growth, questsCompleted, questLog, sky,
      days, activities, notes, hardDays, badges, lineDay,
    } = get();
    AsyncStorage.setItem(KEY, JSON.stringify({
      growth, questsCompleted, questLog, sky,
      days, activities, notes, hardDays, badges, lineDay,
    })).catch(() => {});
  },

  /**
   * Reward for finishing a calm activity. Additive only — there is no
   * subtractGrowth, by design, and no caller should ever need one.
   */
  addGrowth: (n = 1) => {
    set({ growth: get().growth + Math.max(0, n), days: withToday(get().days) });
    get().persist();
    return get().growth;
  },

  /**
   * A finished calm exercise: one growth point, one on the per-exercise
   * counter, and today marked as a day the patient showed up.
   *
   * Replaces a bare addGrowth(1) at the four exercise screens. The per-exercise
   * count is what makes "you have tried all four" a badge rather than a guess.
   */
  completeActivity: (id, n = 1) => {
    const activities = { ...get().activities };
    if (id in activities) activities[id] += 1;
    set({
      growth: get().growth + Math.max(0, n),
      activities,
      days: withToday(get().days),
    });
    get().persist();
    return get().growth;
  },

  /**
   * A daily check-in was saved. `mood` is the 1-5 value; 1 and 2 count as a
   * hard day, which is the only place in the app where a low mood earns
   * anything — and it earns MORE, not less. Writing a note counts separately.
   */
  recordCheckin: ({ mood, hasNote } = {}) => {
    const value = Number(mood);
    const hard = Number.isFinite(value) && value >= 1 && value <= 2;
    set({
      notes: get().notes + (hasNote ? 1 : 0),
      hardDays: get().hardDays + (hard ? 1 : 0),
      days: withToday(get().days),
    });
    get().persist();
  },

  /** Union of what was already earned with what was just earned. Never removes. */
  awardBadges: (ids = []) => {
    const fresh = ids.filter((id) => typeof id === 'string' && !get().badges.includes(id));
    if (!fresh.length) return [];
    set({ badges: [...get().badges, ...fresh] });
    get().persist();
    return fresh;
  },

  /** The comfort line has been seen today; don't show the card again until tomorrow. */
  dismissLine: () => {
    set({ lineDay: dayKey() });
    get().persist();
  },

  todayQuests: () => get().questLog[dayKey()] || [],

  /**
   * Toggling a quest off is allowed — mis-taps happen — but it does not take
   * back the growth point. Once earned, always earned.
   */
  toggleQuest: (id) => {
    const key = dayKey();
    const today = get().questLog[key] || [];
    const already = today.includes(id);
    const next = already ? today.filter((q) => q !== id) : [...today, id];

    set({
      questLog: prune({ ...get().questLog, [key]: next }),
      questsCompleted: already ? get().questsCompleted : get().questsCompleted + 1,
      growth: already ? get().growth : get().growth + 1,
      // Un-ticking does not un-mark the day. The patient was here either way,
      // and presence is about attendance, not output.
      days: withToday(get().days),
    });
    get().persist();
    return !already;
  },

  setSky: (sky) => {
    set({ sky });
    get().persist();
  },
}));
