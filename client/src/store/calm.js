import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayKey } from '../utils/calmData';

const KEY = 'kalimni.calm';
const KEEP_DAYS = 7; // how much of the quest log is worth carrying around

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
};

const prune = (log) => {
  const keys = Object.keys(log).sort().slice(-KEEP_DAYS);
  return Object.fromEntries(keys.map((k) => [k, log[k]]));
};

export const useCalm = create((set, get) => ({
  ...emptyState,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        set({
          growth: Number(saved.growth) || 0,
          questsCompleted: Number(saved.questsCompleted) || 0,
          questLog: prune(saved.questLog && typeof saved.questLog === 'object' ? saved.questLog : {}),
          sky: typeof saved.sky === 'string' ? saved.sky : 'dawn',
        });
      }
    } catch {
      // Corrupt or unreadable: start fresh rather than crash the launch.
    }
    set({ hydrated: true });
  },

  // Persist whatever is current. Never awaited by a UI handler.
  persist: () => {
    const { growth, questsCompleted, questLog, sky } = get();
    AsyncStorage.setItem(KEY, JSON.stringify({ growth, questsCompleted, questLog, sky })).catch(() => {});
  },

  /**
   * Reward for finishing a calm activity. Additive only — there is no
   * subtractGrowth, by design, and no caller should ever need one.
   */
  addGrowth: (n = 1) => {
    set({ growth: get().growth + Math.max(0, n) });
    get().persist();
    return get().growth;
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
    });
    get().persist();
    return !already;
  },

  setSky: (sky) => {
    set({ sky });
    get().persist();
  },
}));
