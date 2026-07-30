import { create } from 'zustand';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme } from '../theme/colors';
import { setSoundEnabled } from '../utils/sound';

const LANG_KEY = 'kalimni.language';
const THEME_KEY = 'kalimni.theme';
const SOUND_KEY = 'kalimni.sound';

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
  hydrated: false,

  hydrate: async () => {
    const [stored, storedTheme, storedSound] = await Promise.all([
      AsyncStorage.getItem(LANG_KEY),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(SOUND_KEY),
    ]);
    const theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
    const themeMode = resolveMode(theme);
    // Only an explicit 'off' turns sound off — an unset key means a fresh
    // install, and the sounds are part of how the app feels.
    const sound = storedSound !== 'off';
    applyTheme(themeMode); // BEFORE first render — App gates on hydrate()
    setSoundEnabled(sound);
    set({ language: stored === 'fr' ? 'fr' : 'ar', theme, themeMode, sound, hydrated: true });
    return stored === 'fr' ? 'fr' : 'ar';
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
