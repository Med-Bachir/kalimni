import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Animated, Easing, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button, BackButton } from '../../components/ui';
import { PopIn } from '../../components/motion';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useCalm } from '../../store/calm';
import { localizeDigits } from '../../utils/format';
import { tap as hapticTap, celebrate as hapticCelebrate } from '../../utils/haptics';
import { pop as soundPop, complete as soundComplete } from '../../utils/sound';

// Passing thoughts, as bubbles.
//
// The therapeutic idea underneath is defusion: a thought is an event that
// happens to you, not a fact about you, and it passes whether or not you
// wrestle with it. So the toy is built so that *both* endings are wins — a
// bubble you pop and a bubble you let drift off the top of the screen are
// counted the same on the summary screen, and the copy says so out loud.
//
// The bubbles are deliberately blank. Printing worries on them would put words
// in someone's head that they had not thought yet, which is the opposite of
// what this is for.

const COUNT = 14;
const MIN_RISE = 8500;
const MAX_RISE = 14000;
const TAP_SLOP = 14; // forgiveness in px around a bubble's edge

// WHY THE BUBBLES ARE NOT PRESSABLE
//
// Reported bug: taps did not pop anything. Each bubble used to be a
// <Pressable> inside an <Animated.View> travelling most of the screen under
// `useNativeDriver: true`, nested in a parent with `overflow: 'hidden'` — a
// combination with several known ways to break Android hit-testing, since the
// native driver moves views on the UI thread without updating the layout tree
// the touch system was built around.
//
// I could not reproduce it on a device to pin down which one it was, so this
// fix deliberately does not depend on knowing: the bubbles stop being touch
// targets at all. They are pure visuals now, one responder covers the whole
// field, and a tap is resolved in JS against positions recomputed from
// elapsed time. Transform/layout mismatch, clipping, z-order and phantom
// zero-opacity targets all stop being able to cause this class of bug.
//
// It works because the motion is completely deterministic — linear rise, fixed
// duration, fixed delay, fixed sway. `positionAt` below evaluates the same
// curve the animation is driving, so the hit test is exact rather than
// approximate. It also fixes a second, quieter problem: choosing the nearest
// centre means overlapping bubbles pop the one you were actually aiming at.

/** Where a bubble is, t seconds into the round. Mirrors the Animated config. */
function positionAt(conf, elapsed, fieldH) {
  const t = (elapsed - conf.delay) / conf.duration;
  if (t < 0 || t > 1) return null;

  // translateY: fieldH -> -size-20, linear. translateX: 0 -> sway -> 0.
  const y = fieldH + t * (-conf.size - 20 - fieldH);
  const x = t < 0.5 ? conf.sway * (t / 0.5) : conf.sway * (1 - (t - 0.5) / 0.5);
  return { cx: conf.left + x + conf.size / 2, cy: y + conf.size / 2, r: conf.size / 2 };
}

function Bubble({ conf, fieldH, onGone, onPop, registerBurst }) {
  const rise = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const popped = useRef(false);
  const reported = useRef(false);

  const finish = useCallback((wasPopped) => {
    if (reported.current) return;
    reported.current = true;
    onGone(wasPopped);
  }, [onGone]);

  const burst = useCallback(() => {
    if (popped.current) return;
    popped.current = true;
    hapticTap();
    // Quietest sound in the palette by some margin — this one can fire
    // fourteen times in a minute and still has to sit under the room.
    soundPop();
    onPop();
    Animated.timing(pop, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => finish(true));
  }, [finish, onPop, pop]);

  // Hand the field a way to pop this bubble, and a way to ask whether it still
  // can be popped, without re-rendering anything.
  useEffect(() => {
    registerBurst(conf.id, { burst, isPopped: () => popped.current });
    return () => registerBurst(conf.id, null);
  }, [conf.id, burst, registerBurst]);

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: conf.duration,
      delay: conf.delay,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => finished && finish(false));
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: conf.left,
        top: 0,
        opacity: Animated.multiply(
          rise.interpolate({ inputRange: [0, 0.06, 0.86, 1], outputRange: [0, 1, 1, 0] }),
          pop.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
        ),
        transform: [
          { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [fieldH, -conf.size - 20] }) },
          { translateX: rise.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, conf.sway, 0] }) },
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
        ],
      }}
    >
      <View
        style={{
          width: conf.size, height: conf.size, borderRadius: conf.size / 2,
          backgroundColor: 'rgba(255,255,255,.22)',
          borderWidth: 1.5, borderColor: 'rgba(255,255,255,.45)',
        }}
      >
        {/* highlight — makes it read as a bubble rather than a circle */}
        <View
          style={{
            position: 'absolute', top: conf.size * 0.18, left: conf.size * 0.2,
            width: conf.size * 0.24, height: conf.size * 0.16, borderRadius: conf.size,
            backgroundColor: 'rgba(255,255,255,.55)',
            transform: [{ rotate: '-25deg' }],
          }}
        />
      </View>
    </Animated.View>
  );
}

export default function BubblesScreen({ navigation }) {
  const { t, lang } = useI18n();
  const { width } = useWindowDimensions();
  const completeActivity = useCalm((s) => s.completeActivity);

  const [running, setRunning] = useState(false);
  const [popped, setPopped] = useState(0);
  const [gone, setGone] = useState(0);
  const [round, setRound] = useState(0); // remounts the field for "again"
  // Measured, not assumed. The field is the area below the header, so using the
  // window height here (as this screen used to) started every bubble well below
  // the visible area and wasted the first seconds of its life behind the bezel.
  const [fieldH, setFieldH] = useState(0);
  const rewarded = useRef(false);

  // id -> { burst, isPopped }, populated by the bubbles themselves.
  const handles = useRef(new Map()).current;
  const startedAt = useRef(0);

  const registerBurst = useCallback((id, handle) => {
    if (handle) handles.set(id, handle);
    else handles.delete(id);
  }, [handles]);

  // One config per bubble, regenerated per round. Held in state rather than a
  // ref so the field and the hit test always read exactly the same numbers.
  const [bubbles, setBubbles] = useState([]);

  const finished = running && gone >= COUNT;
  const n = (v) => localizeDigits(v, lang);

  /**
   * Resolve a tap against every bubble still in the air.
   *
   * Topmost first: bubbles drawn later sit above earlier ones, and the highest
   * on screen is the one nearest the finger's visual target when two overlap.
   */
  const handleTap = (px, py) => {
    if (!fieldH) return;
    const elapsed = Date.now() - startedAt.current;

    let best = null;
    bubbles.forEach((conf) => {
      const handle = handles.get(conf.id);
      if (!handle || handle.isPopped()) return;
      const at = positionAt(conf, elapsed, fieldH);
      if (!at) return;
      const dx = px - at.cx;
      const dy = py - at.cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > at.r + TAP_SLOP) return;
      // Prefer the one whose centre is nearest — with slop, two neighbours can
      // both contain the point, and popping the closer one is what a finger
      // means.
      if (!best || distance < best.distance) best = { distance, handle };
    });

    if (best) best.handle.burst();
  };

  useEffect(() => {
    if (!finished || rewarded.current) return;
    rewarded.current = true;
    completeActivity('bubbles');
    hapticCelebrate();
    soundComplete();
  }, [finished]);

  const handleGone = useCallback(() => setGone((g) => g + 1), []);
  const handlePop = useCallback(() => setPopped((p) => p + 1), []);

  const start = () => {
    rewarded.current = false;
    handles.clear();
    startedAt.current = Date.now();
    setPopped(0);
    setGone(0);
    setBubbles(
      Array.from({ length: COUNT }, (_, i) => {
        const size = 44 + Math.random() * 52;
        const left = Math.max(4, Math.min(width * (0.08 + Math.random() * 0.78) - size / 2, width - size - 4));
        return {
          id: `b${i}`,
          size,
          left,
          sway: (Math.random() > 0.5 ? 1 : -1) * (12 + Math.random() * 26),
          duration: MIN_RISE + Math.random() * (MAX_RISE - MIN_RISE),
          delay: i * (450 + Math.random() * 500),
        };
      })
    );
    setRound((r) => r + 1);
    setRunning(true);
  };

  return (
    <Screen edges={['top', 'bottom']} bg={colors.primaryDark}>
      <LinearGradient colors={['#7FA9BF', colors.primaryDark]} style={{ flex: 1 }}>
        <View style={{ padding: 22, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 2 }}>
          <BackButton light onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <T w="700" size={17} color="#FFFFFF">{t('bubbles.title')}</T>
          </View>
          {running && !finished && (
            <T w="600" size={13} color="rgba(255,255,255,.75)">
              {n(popped)} / {n(COUNT)}
            </T>
          )}
        </View>

        {!running ? (
          <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 20 }}>
            <Ionicons name="water-outline" size={46} color="rgba(255,255,255,.9)" style={{ alignSelf: 'center' }} />
            <T w="700" size={21} color="#FFFFFF" style={{ textAlign: 'center', lineHeight: 33 }}>
              {t('bubbles.introTitle')}
            </T>
            <T size={14.5} color="rgba(255,255,255,.8)" style={{ textAlign: 'center', lineHeight: 26 }}>
              {t('bubbles.introBody')}
            </T>
            <Button title={t('bubbles.start')} variant="light" onPress={start} style={{ marginTop: 10 }} />
          </View>
        ) : finished ? (
          <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 18 }}>
            <PopIn>
              <View style={{ alignItems: 'center', gap: 14 }}>
                <Ionicons name="checkmark-circle" size={58} color="#FFFFFF" />
                <T w="700" size={20} color="#FFFFFF" style={{ textAlign: 'center' }}>
                  {t('bubbles.doneTitle')}
                </T>
                <T size={14.5} color="rgba(255,255,255,.85)" style={{ textAlign: 'center', lineHeight: 26 }}>
                  {t('bubbles.doneBody', { popped: n(popped), drifted: n(COUNT - popped) })}
                </T>
                <T size={13} color="rgba(255,255,255,.65)" style={{ textAlign: 'center', lineHeight: 22 }}>
                  {t('bubbles.doneNote')}
                </T>
              </View>
            </PopIn>
            <View style={{ gap: 10, marginTop: 10 }}>
              <Button title={t('bubbles.again')} variant="light" onPress={start} />
              <Button title={t('common.close')} variant="outline" onPress={() => navigation.goBack()} />
            </View>
          </View>
        ) : (
          <View
            style={{ flex: 1, overflow: 'hidden' }}
            onLayout={(e) => setFieldH(e.nativeEvent.layout.height)}
            // One responder for the whole field. `onStartShouldSetResponder`
            // claims the touch immediately so the pop lands on touch-down
            // rather than on release — a bubble that pops when you lift your
            // finger feels broken even when it works.
            onStartShouldSetResponder={() => true}
            onResponderGrant={(e) => handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          >
            {fieldH > 0 && bubbles.map((conf) => (
              <Bubble
                key={`${round}-${conf.id}`}
                conf={conf}
                fieldH={fieldH}
                onGone={handleGone}
                onPop={handlePop}
                registerBurst={registerBurst}
              />
            ))}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 26, alignItems: 'center' }}>
              <T size={13} color="rgba(255,255,255,.6)">{t('bubbles.hint')}</T>
            </View>
          </View>
        )}
      </LinearGradient>
    </Screen>
  );
}
