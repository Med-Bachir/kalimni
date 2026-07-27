import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, Pressable, AccessibilityInfo, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from './ui';
import { AnimatedLogoMark } from './Logo';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';

// The first screen of every session.
//
// It is deliberately short and deliberately calm: roughly 1.6s from first pixel
// to gone, one entrance per element, nothing looping. Someone opening a mental
// health app at 3am does not want to be performed at — the splash exists to say
// "you're in the right place" and then get out of the way.
//
// Three ways it ends, and all of them end it:
//   - the animation completes and the hold expires (the normal path)
//   - the user taps anywhere (impatience is a valid input)
//   - a hard 3s ceiling fires (belt and braces: if an animation callback is
//     ever dropped, the app must not be stuck behind a logo)
//
// Reduce Motion is honoured: if the OS asks for less animation we show the
// static composition for a beat and fade out, rather than skipping the brand
// moment entirely.

const HOLD_AFTER_SETTLE = 420;   // ms the finished logo rests before leaving
const FADE_OUT = 380;
const HARD_CEILING = 3000;

export default function SplashOverlay({ onFinish }) {
  const { t } = useI18n();
  const fade = useRef(new Animated.Value(1)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(null); // null = still asking
  const dismissed = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(!!v))
      .catch(() => alive && setReduceMotion(false));
    return () => { alive = false; };
  }, []);

  // Wordmark rises just behind the mark rather than with it, so the eye reads
  // the symbol first and the name second.
  useEffect(() => {
    if (reduceMotion === null) return;
    Animated.timing(wordmark, {
      toValue: 1,
      duration: reduceMotion ? 0 : 420,
      delay: reduceMotion ? 0 : 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion]);

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    Animated.timing(fade, {
      toValue: 0,
      duration: FADE_OUT,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => onFinish?.());
  };

  // Safety net — the overlay covers the whole app, so it must never be the
  // thing that hangs. Runs regardless of how the animation actually went.
  useEffect(() => {
    const id = setTimeout(dismiss, HARD_CEILING);
    return () => clearTimeout(id);
  }, []);

  // Reduce Motion: no entrance choreography, just a short static beat.
  useEffect(() => {
    if (reduceMotion !== true) return;
    const id = setTimeout(dismiss, 700);
    return () => clearTimeout(id);
  }, [reduceMotion]);

  const settled = () => setTimeout(dismiss, HOLD_AFTER_SETTLE);

  if (reduceMotion === null) {
    // One frame at most: a flat brand-coloured field, so there is never a
    // white flash between the native splash and this one.
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgSoft }]} />;
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 10 }]}>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('common.appName')}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={[colors.bgSoft, colors.bg]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26, padding: 32 }}
        >
          {reduceMotion ? (
            <AnimatedLogoMark size={112} />
          ) : (
            <AnimatedLogoMark size={112} onSettled={settled} />
          )}

          <Animated.View
            style={{
              alignItems: 'center',
              gap: 10,
              opacity: wordmark,
              transform: [
                { translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
            }}
          >
            <T w="700" size={34}>{t('common.appName')}</T>
            <T size={14.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 24 }}>
              {t('splash.line')}
            </T>
          </Animated.View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
