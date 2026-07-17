import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';

import { colors } from './src/theme/colors';
import { useSettings } from './src/store/settings';
import { useAuth } from './src/store/auth';
import { ensureLayoutDirection } from './src/utils/rtl';
import RootNavigator from './src/navigation';
import { navigationRef } from './src/navigation/navigationRef';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false },
  },
});

// Built per render (not at module load): `colors` is mutated on theme change.
const navTheme = () => ({
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg, primary: colors.primary,
    card: colors.card, text: colors.ink, border: colors.border,
  },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });
  const [ready, setReady] = useState(false);
  const themeMode = useSettings((s) => s.themeMode);

  useEffect(() => {
    (async () => {
      const lang = await useSettings.getState().hydrate();
      // Applying a direction change reloads the app in dev; the new instance
      // will pass straight through this check.
      ensureLayoutDirection(lang);
      await useAuth.getState().boot();
      setReady(true);
    })();
  }, []);

  if (!fontsLoaded || !ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* key={themeMode}: toggling the theme remounts the tree so every
          inline style re-reads the mutated `colors` palette. */}
      <SafeAreaProvider key={themeMode}>
        <NavigationContainer ref={navigationRef} theme={navTheme()}>
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} backgroundColor={colors.bg} />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
