import { create } from 'zustand';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme } from '../theme/colors';
import { setSoundEnabled } from '../utils/sound';

const LANG_KEY = 'kalimni.language';
const THEME_KEY = 'kalimni.theme';
const SOUND_KEY = 'kalimni.sound';
const COMPANION_KEY = 'kalimni.companion';

// null = follow the OS setting.
const resolveMode = (theme) =>
  theme === 'dark' || theme === 'light'
    ? theme
    : Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

export const useSettings = create((set) => ({
  language: 'ar', // Arabic-first
  theme: null, // 'light' | 'dark' | null (system)
  themeMode: 'light', // resolved: what's actually applied
  sound: true, // UI sounds on completions; opt-out, never opt-in
  companion: true, // the spirit animal wandering over the app
  hydrated: false,

  hydrate: async () => {
    const [stored, storedTheme, storedSound, storedCompanion] = await Promise.all([
      AsyncStorage.getItem(LANG_KEY),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(SOUND_KEY),
      AsyncStorage.getItem(COMPANION_KEY),
    ]);
    const theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
    const themeMode = resolveMode(theme);
    // Only an explicit 'off' turns sound off — an unset key means a fresh
    // install, and the sounds are part of how the app feels.
    const sound = storedSound !== 'off';
    const companion = storedCompanion !== 'off';
    applyTheme(themeMode); // BEFORE first render — App gates on hydrate()
    setSoundEnabled(sound);
    set({ language: stored === 'fr' ? 'fr' : 'ar', theme, themeMode, sound, companion, hydrated: true });
    return stored === 'fr' ? 'fr' : 'ar';
  },

  // Turning this off retires the roaming animal completely — it stops walking
  // over screens and stops making noise. The spirit itself, its habitat and its
  // bond are untouched; it is still there in the garden and on its own screen.
  // Nothing is lost by switching this off, which is the point of having it.
  setCompanion: async (companion) => {
    set({ companion });
    await AsyncStorage.setItem(COMPANION_KEY, companion ? 'on' : 'off');
  },

  // Mirrored into utils/sound so call sites never have to check the store.
  setSound: async (sound) => {
    setSoundEnabled(sound);
    set({ sound });
    await AsyncStorage.setItem(SOUND_KEY, sound ? 'on' : 'off');
  },

  setLanguage: async (language) => {
    set({ language });
    await AsyncStorage.setItem(LANG_KEY, language);
  },

  // theme: 'light' | 'dark' | null (system). Mutates the palette and updates
  // themeMode — App.js keys the tree on themeMode, so the UI remounts themed.
  setTheme: async (theme) => {
    const themeMode = resolveMode(theme);
    applyTheme(themeMode);
    set({ theme, themeMode });
    if (theme) await AsyncStorage.setItem(THEME_KEY, theme);
    else await AsyncStorage.removeItem(THEME_KEY);
  },
}));
