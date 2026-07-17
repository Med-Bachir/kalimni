import { create } from 'zustand';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme } from '../theme/colors';

const LANG_KEY = 'kalimni.language';
const THEME_KEY = 'kalimni.theme';

// null = follow the OS setting.
const resolveMode = (theme) =>
  theme === 'dark' || theme === 'light'
    ? theme
    : Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

export const useSettings = create((set) => ({
  language: 'ar', // Arabic-first
  theme: null, // 'light' | 'dark' | null (system)
  themeMode: 'light', // resolved: what's actually applied
  hydrated: false,

  hydrate: async () => {
    const [stored, storedTheme] = await Promise.all([
      AsyncStorage.getItem(LANG_KEY),
      AsyncStorage.getItem(THEME_KEY),
    ]);
    const theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
    const themeMode = resolveMode(theme);
    applyTheme(themeMode); // BEFORE first render — App gates on hydrate()
    set({ language: stored === 'fr' ? 'fr' : 'ar', theme, themeMode, hydrated: true });
    return stored === 'fr' ? 'fr' : 'ar';
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
