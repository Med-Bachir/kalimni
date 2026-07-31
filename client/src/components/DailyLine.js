import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { T } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { useCalm } from '../store/calm';
import { comfortLine } from '../utils/comfort';
import { dayKey } from '../utils/calmData';
import { tap as hapticTap } from '../utils/haptics';

// The first thing on the home screen, once a day.
//
// It appears at the top of Home rather than over the splash on purpose. The
// splash is 1.6 seconds and exists to get out of the way (see SplashOverlay) —
// putting a sentence someone is meant to actually read behind a timed fade
// means most people never finish it. Here it waits.
//
// Dismissing is per-day and permanent for that day: tapping it puts it away
// until tomorrow. It never returns mid-day, and there is no counter anywhere
// of how many were read. It is a greeting, not a task.

const RISE = 520;

export default function DailyLine() {
  const { t, lang } = useI18n();
  const lineDay = useCalm((s) => s.lineDay);
  const dismissLine = useCalm((s) => s.dismissLine);

  const enter = useRef(new Animated.Value(0)).current;
  const line = comfortLine(lang);
  const showing = !!line && lineDay !== dayKey();

  useEffect(() => {
    if (!showing) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: RISE,
      delay: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showing]);

  if (!showing) return null;

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      <Pressable
        onPress={() => { hapticTap(); dismissLine(); }}
        accessibilityRole="button"
        accessibilityLabel={line}
        accessibilityHint={t('comfort.dismissHint')}
      >
        <LinearGradient
          colors={colors.tintSand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: 18, gap: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="leaf-outline" size={16} color="#7A5B32" />
            <T w="700" size={11.5} color="#7A5B32" style={{ flex: 1 }}>{t('comfort.label')}</T>
            <Ionicons name="close" size={15} color="#A98A61" />
          </View>
          {/* Larger and looser than body copy. This is the one string in the
              app meant to be read slowly. */}
          <T size={15.5} color="#4A3922" style={{ lineHeight: 27 }}>{line}</T>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
