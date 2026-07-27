import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Easing } from 'react-native';
import { T } from './ui';

// PressableScale lives in ui.js because Card and Button build on it, and ui.js
// must not import this module (that would be a cycle). Re-exported here so
// callers have a single place to reach for motion.
export { PressableScale } from './ui';

// Motion primitives built on React Native's built-in Animated — no extra native
// dependency, so most of this ships over EAS Update rather than needing a build.
//
// The rule everywhere below: motion is feedback, not decoration. Entrances tell
// you content arrived, press-scale tells you the tap registered, a growing bar
// tells you what the number means. Nothing loops or moves without being asked.

// Transform/opacity animations run on the native driver; anything animating
// layout (width/height) cannot, and says so at the call site.
const NATIVE = { useNativeDriver: true };

/**
 * Fades and lifts children into place on mount. `index` staggers siblings so a
 * screen assembles itself instead of snapping in all at once.
 */
export function FadeIn({ children, index = 0, delay = 0, style }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 380,
      delay: delay + index * 60,
      easing: Easing.out(Easing.cubic),
      ...NATIVE,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Counts from 0 to `value` on mount. Takes a `format` so callers can localise
 * digits (Arabic numerals) without this knowing about i18n.
 */
export function CountUp({ value = 0, format = String, duration = 800, ...textProps }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // Layout-free but reads the value on the JS side, so no native driver.
    const id = progress.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(progress, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.removeListener(id);
  }, [value]);

  return <T {...textProps}>{format(shown)}</T>;
}

/**
 * Horizontal bar that fills to `progress` (0..1) on mount and animates on
 * change. Width is a layout prop, so this one runs on the JS driver.
 */
export function ProgressBar({ progress = 0, height = 8, trackColor, fillColor, style }) {
  const value = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    Animated.timing(value, {
      toValue: target,
      duration: 900,
      delay: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [target]);

  return (
    <View
      style={[
        { height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: fillColor,
          width: value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/**
 * Springs children in with a slight overshoot. Used for the one genuine
 * celebration in the app, so it is allowed to be a little theatrical.
 */
export function PopIn({ children, delay = 0, style }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, delay, speed: 12, bounciness: 12, ...NATIVE }),
      Animated.timing(opacity, { toValue: 1, duration: 260, delay, ...NATIVE }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ scale }] }, style]}>{children}</Animated.View>
  );
}

/**
 * Soft pulse radiating out from behind a celebration icon. Runs three times and
 * stops — an endlessly looping element on a mental-health screen is agitating.
 */
export function Pulse({ size = 64, color, delay = 0 }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), ...NATIVE }),
        Animated.timing(value, { toValue: 0, duration: 0, ...NATIVE }),
      ]),
      { iterations: 3 }
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
        transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.8] }) }],
      }}
    />
  );
}

/**
 * Staggered vertical bars that grow from the baseline. `bars` is
 * [{ key, height, color }] with heights already resolved in px.
 */
export function GrowBars({ bars, trackHeight, radius = 8, gap = 7, trackColor, labelFor }) {
  // One value per column; the series length is fixed per mount (7 or 14 days).
  const values = useRef(bars.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      45,
      values.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // height is a layout prop
        })
      )
    ).start();
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap }}>
      {bars.map((bar, i) => (
        <View key={bar.key} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
          <View style={{
            width: '100%', height: trackHeight, borderRadius: radius,
            backgroundColor: trackColor, justifyContent: 'flex-end', overflow: 'hidden',
          }}>
            {bar.height > 0 && (
              <Animated.View style={{
                height: values[i].interpolate({ inputRange: [0, 1], outputRange: [0, bar.height] }),
                borderRadius: radius,
                backgroundColor: bar.color,
              }} />
            )}
          </View>
          {labelFor ? labelFor(bar, i) : null}
        </View>
      ))}
    </View>
  );
}
