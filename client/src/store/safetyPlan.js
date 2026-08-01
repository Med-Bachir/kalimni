import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Safety Plan (Stanley-Brown), Phase 2.1. DEVICE-LOCAL BY DESIGN: the plan
// never leaves this phone — no API call touches it, nothing here is synced.
// (Rule 7: local by default. Sharing with the specialist, if it ever comes,
// will be a separate explicit per-section consent.)
//
// Six sections, written while calm, read on the worst day:
//   warningSigns       — how a crisis announces itself to ME
//   copingAlone        — things that help me without anyone else
//   distractions       — people and places that take my mind elsewhere
//   contacts           — people I can ask for help ({name, phone?})
//   professionals      — services and clinicians ({name, phone}), pre-filled
//                        with Algeria's national emergency numbers
//   environmentSafety  — making my surroundings safer

const KEY = 'kalimni.safetyPlan.v1';

// National numbers, seeded so the professionals section is never empty.
// Labels carry both languages — the plan must read on the worst day whatever
// the language setting is.
export const DEFAULT_PROFESSIONALS = [
  { name: 'الحماية المدنية · Protection civile', phone: '14' },
  { name: 'الشرطة · Police', phone: '17' },
  { name: 'SAMU الاستعجالات الطبية', phone: '115' },
];

export const TEXT_SECTIONS = ['warningSigns', 'copingAlone', 'distractions', 'environmentSafety'];
export const CONTACT_SECTIONS = ['contacts', 'professionals'];

const emptyPlan = () => ({
  warningSigns: [],
  copingAlone: [],
  distractions: [],
  contacts: [],
  professionals: [...DEFAULT_PROFESSIONALS],
  environmentSafety: [],
  updatedAt: new Date().toISOString(),
});

// A plan "exists" once the patient has written anything of their own.
const hasOwnContent = (plan) =>
  !!plan && (
    TEXT_SECTIONS.some((s) => plan[s]?.length) || plan.contacts?.length > 0
  );

export const useSafetyPlan = create((set, get) => ({
  plan: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ plan: raw ? JSON.parse(raw) : null, hydrated: true });
    } catch {
      set({ plan: null, hydrated: true });
    }
  },

  // Every mutation autosaves — there is no "save" step to forget.
  addItem: async (section, value) => {
    const plan = get().plan || emptyPlan();
    const next = { ...plan, [section]: [...(plan[section] || []), value], updatedAt: new Date().toISOString() };
    set({ plan: next });
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  },

  removeItem: async (section, index) => {
    const plan = get().plan;
    if (!plan) return;
    const next = {
      ...plan,
      [section]: (plan[section] || []).filter((_, i) => i !== index),
      updatedAt: new Date().toISOString(),
    };
    set({ plan: next });
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  },

  hasPlan: () => hasOwnContent(get().plan),
}));
