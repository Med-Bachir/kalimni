import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
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
import { useCalm } from './src/store/calm';
import { useSpirit } from './src/store/spirit';
import { ensureLayoutDirection } from './src/utils/rtl';
import { preloadSounds } from './src/utils/sound';
import RootNavigator from './src/navigation';
import { navigationRef } from './src/navigation/navigationRef';
import SplashOverlay from './src/components/SplashOverlay';
import FloatingSpirit from './src/components/FloatingSpirit';

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
  const [splashDone, setSplashDone] = useState(false);
  const themeMode = useSettings((s) => s.themeMode);

  useEffect(() => {
    (async () => {
      const lang = await useSettings.getState().hydrate();
      // Applying a direction change reloads the app in dev; the new instance
      // will pass straight through this check.
      ensureLayoutDirection(lang);
      // Calm Corner state is local-only and small; hydrating it here means the
      // garden is already correct the first time it renders, with no flash of
      // an empty plot.
      await useCalm.getState().hydrate();
      // Same reasoning as the calm store: the spirit animal has to be known
      // before the companion tab first renders, or the patient sees the "meet
      // your spirit animal" invitation flash over an animal they already met.
      await useSpirit.getState().hydrate();
      await useAuth.getState().boot();
      // Decode the UI sounds now rather than on the first tap that needs one.
      // Fire-and-forget: nothing here is awaited and nothing can throw.
      preloadSounds();
      setReady(true);
    })();
  }, []);

  // Boot gate. Deliberately a flat field in the same colour the splash starts
  // on — no spinner. Two loading states back to back (spinner, then splash)
  // reads as a stutter; one continuous surface reads as one launch.
  if (!fontsLoaded || !ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bgSoft }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* key={themeMode}: toggling the theme remounts the tree so every
          inline style re-reads the mutated `colors` palette. */}
      <SafeAreaProvider key={themeMode}>
        <NavigationContainer ref={navigationRef} theme={navTheme()}>
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} backgroundColor={colors.bg} />
          <RootNavigator />
          {/* The spirit animal, loose over the whole app. Mounted here rather
              than inside a screen so it survives navigation instead of being
              re-mounted (and teleported back to its starting corner) on every
              push. It hides itself on the screens where attention is not
              optional — see the HIDE_ON list in the component. */}
          {splashDone && <FloatingSpirit />}
          {/* Sits above the navigator and removes itself. Mounting it here
              rather than as a route means it covers whichever screen the app
              restored to, including a deep link or a resumed call. */}
          {!splashDone && <SplashOverlay onFinish={() => setSplashDone(true)} />}
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
