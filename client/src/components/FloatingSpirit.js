import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, useWindowDimensions } from 'react-native';
import SpiritAnimal from './SpiritAnimal';
import { colors } from '../theme/colors';
import { T } from './ui';
import { useSpirit } from '../store/spirit';
import { useCalm } from '../store/calm';
import { useSettings } from '../store/settings';
import { useAuth } from '../store/auth';
import { useI18n } from '../i18n';
import { navigationRef } from '../navigation/navigationRef';
import { tap as hapticTap } from '../utils/haptics';
import { voice as soundVoice } from '../utils/sound';

// The spirit animal, loose in the app.
//
// It lives above the navigator (mounted in App.js next to SplashOverlay), so it
// is not part of any screen and does not scroll away with one. It wanders along
// the bottom of the display, turns to face the way it is walking, and answers
// when you tap it.
//
// THE RULE THIS COMPONENT EXISTS TO OBEY: it must never be in the way. A pet
// that covers a button is a bug; a pet that covers a crisis phone number is a
// safety incident. Hence, in order of importance:
//
//   - hard-hidden on every screen where attention is not optional (below)
//   - pointerEvents="box-none", so only the animal itself is tappable and
//     every pixel around it passes touches through to the screen underneath
//   - confined to a band above the tab bar, never near a header or a composer
//   - one setting turns it off permanently, and that setting is honoured
//     everywhere, not just here
//
// It also never speaks first: no notification, no attention-grabbing bounce, no
// "come back and play with me". It walks around and waits.

// Screens the animal must not appear on.
//
// Crisis/Call/IncomingCall are non-negotiable — someone reading an emergency
// number does not need a cartoon fox walking across it. The exercises are
// full-screen and focus-dependent, and the spirit screens already show the
// animal at full size, so a second copy would be nonsense.
const HIDE_ON = new Set([
  'Crisis',
  'Call',
  'IncomingCall',
  'Breathing',
  'Grounding',
  'Bubbles',
  'Reframe',
  'SpiritQuiz',
  'SpiritHome',
  'Questionnaire',
  'Disclaimer',
  'Result',
]);

const SIZE = 66;

export default function FloatingSpirit() {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const id = useSpirit((s) => s.id);
  const growth = useCalm((s) => s.growth);
  const enabled = useSettings((s) => s.companion);
  const user = useAuth((s) => s.user);

  const [route, setRoute] = useState(null);
  const [taps, setTaps] = useState(0);
  const [flip, setFlip] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const x = useRef(new Animated.Value(width * 0.62)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const speakTimer = useRef(null);
  const walkTimer = useRef(null);
  const posRef = useRef(width * 0.62);

  // Track the current route so the animal can hide itself.
  //
  // Every call is guarded: the container ref throws rather than returning
  // undefined when it is not ready, and "not ready" is a real state here — this
  // mounts the moment the splash clears, which can land before or after the
  // navigator settles depending on how fast the device is. A throw in this
  // effect would take down the whole app for a decorative animal.
  useEffect(() => {
    const sync = () => {
      try {
        setRoute(navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name ?? null : null);
      } catch {
        setRoute(null);
      }
    };
    sync();
    let unsubscribe;
    try {
      unsubscribe = navigationRef.addListener('state', sync);
    } catch {
      // No listener: the animal stays hidden rather than roaming over a
      // screen it cannot identify. Failing closed is the right way round.
    }
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // `route === null` means the navigator has not reported yet — treat that as
  // hidden too, so the animal never flashes over an unknown screen.
  const hidden = !id || !enabled || user?.role !== 'patient' || route === null || HIDE_ON.has(route);

  // Fade rather than unmount, so walking across a screen transition does not
  // snap the animal back to its starting corner.
  useEffect(() => {
    Animated.timing(fade, {
      toValue: hidden ? 0 : 1,
      duration: hidden ? 180 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden]);

  // A slow walk to a new spot, then a pause. Both durations are long: this is
  // ambient, and something darting around the edge of the screen while someone
  // is reading is the exact opposite of what the app is for.
  useEffect(() => {
    if (hidden) return undefined;
    let cancelled = false;

    const step = () => {
      const margin = 14;
      const target = margin + Math.random() * Math.max(1, width - SIZE - margin * 2);
      const distance = Math.abs(target - posRef.current);
      if (distance > 4) setFlip(target < posRef.current);
      posRef.current = target;

      Animated.timing(x, {
        toValue: target,
        // Pace scales with distance, so it never sprints across the screen.
        duration: 2600 + distance * 14,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        if (cancelled) return;
        walkTimer.current = setTimeout(step, 4000 + Math.random() * 7000);
      });
    };

    walkTimer.current = setTimeout(step, 2500);
    return () => {
      cancelled = true;
      clearTimeout(walkTimer.current);
    };
  }, [hidden, width]);

  // A small vertical bob while it walks — the difference between an animal
  // moving and a sticker sliding.
  useEffect(() => {
    if (hidden) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 680, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hidden]);

  useEffect(() => () => {
    clearTimeout(speakTimer.current);
    clearTimeout(walkTimer.current);
  }, []);

  if (!id || user?.role !== 'patient' || !enabled) return null;

  const onPress = () => {
    hapticTap();
    soundVoice(id);
    setTaps((n) => n + 1);
    setSpeaking(true);
    clearTimeout(speakTimer.current);
    speakTimer.current = setTimeout(() => setSpeaking(false), 1900);
  };

  const openHome = () => {
    hapticTap();
    try {
      if (navigationRef.isReady()) navigationRef.navigate('SpiritHome');
    } catch {
      // Long-press is a shortcut, not the only way in — the garden and the
      // profile both reach the same screen.
    }
  };

  return (
    // box-none: this wrapper covers the screen but is transparent to touch.
    // Only the Pressable around the animal receives anything.
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
    >
      <Animated.View
        pointerEvents={hidden ? 'none' : 'box-none'}
        style={{
          position: 'absolute',
          // Sits above the tab bar (62px) with room to spare, so it never
          // overlaps a tab target.
          bottom: Math.max(78, height * 0.11),
          left: 0,
          opacity: fade,
          transform: [
            { translateX: x },
            { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
          ],
        }}
      >
        {/* Speech bubble on tap. Text only, no actions — it is the animal
            making a noise, not a prompt asking for something. */}
        {speaking && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: SIZE - 4,
              left: -30,
              minWidth: 118,
              backgroundColor: colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <T size={11.5} color={colors.muted} style={{ lineHeight: 17 }}>
              {t(`spirit.chatter.${taps % 4}`, { name: t(`spirit.animals.${id}.name`) })}
            </T>
          </View>
        )}

        <Pressable onPress={onPress} onLongPress={openHome} delayLongPress={320} hitSlop={6}>
          <SpiritAnimal
            id={id}
            size={SIZE}
            points={growth}
            flip={flip}
            pulseKey={taps}
            expression={speaking ? 'happy' : 'idle'}
            aura={false}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}
