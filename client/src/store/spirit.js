import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spiritFor, spiritById } from '../utils/spiritData';

const KEY = 'kalimni.spirit';

// Which spirit animal the patient met, stored on the device only.
//
// On the device for the same reason store/calm.js is: this is not clinical
// data. "Chose the fox" tells a specialist nothing useful and tells a database
// something it has no business knowing. It is a drawing that keeps someone
// company at the top of a chat window.
//
// Writes are fire-and-forget, like the calm store — a failed write costs the
// user one re-take of a five-question quiz.

const empty = {
  id: null,          // spirit id, null until the quiz is finished
  discoveredAt: null, // ISO string, for the "with you since" line
  answers: [],       // kept so a retake can pre-fill, and so the result is explainable
};

export const useSpirit = create((set, get) => ({
  ...empty,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? JSON.parse(raw) : null;
      // Validate the id against the current roster: a spirit removed in a later
      // version must not leave the chat header rendering nothing.
      if (saved && typeof saved.id === 'string' && spiritById(saved.id).id === saved.id) {
        set({
          id: saved.id,
          discoveredAt: typeof saved.discoveredAt === 'string' ? saved.discoveredAt : null,
          answers: Array.isArray(saved.answers) ? saved.answers : [],
        });
      }
    } catch {
      // Corrupt or unreadable: the patient simply meets their spirit again.
    }
    set({ hydrated: true });
  },

  persist: () => {
    const { id, discoveredAt, answers } = get();
    AsyncStorage.setItem(KEY, JSON.stringify({ id, discoveredAt, answers })).catch(() => {});
  },

  /**
   * Finish the quiz. Returns the resolved spirit id so the reveal screen can
   * animate it without waiting for the store to round-trip.
   *
   * `discoveredAt` is only set the first time — a retake changes which animal
   * is on screen but does not reset how long the patient has had one.
   */
  discover: (answers) => {
    const id = spiritFor(answers);
    set({
      id,
      answers,
      discoveredAt: get().discoveredAt || new Date().toISOString(),
    });
    get().persist();
    return id;
  },
}));
