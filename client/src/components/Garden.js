import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { gardenFor, skyById, PLANT_GREENS, BLOOMS, GARDEN_CAPACITY } from '../utils/calmData';

// The garden. Every plant is one thing the patient did — a check-in, a
// breathing round, a grounding session, a quest — and the plot only ever fills
// up. There is no watering, no decay, no "your garden misses you" notification.
//
// Drawn from plain Views: circles, rounded bars and rotated petals. No SVG
// dependency, so it ships over EAS Update, and it costs a few dozen views.
//
// Two rows give the plot depth: the back row is smaller, dimmer and slightly
// desaturated, so eighteen plants read as a garden rather than a bar chart.

const HEIGHT = 196;
const GROUND = 58;
// Baselines sit *below* the soil line, not on it — a plant whose stem stops
// exactly at the surface reads as hovering over the bed rather than planted in
// it. The front row is lower still, which is what makes it read as nearer.
const BACK_BASE = HEIGHT - GROUND + 10;
const FRONT_BASE = HEIGHT - GROUND + 28;

/** One plant, sized and shaped by tier. `scale` handles the depth rows. */
function Plant({ tier, index, scale = 1, delay = 0 }) {
  const grow = useRef(new Animated.Value(0)).current;
  const [stemA, stemB] = PLANT_GREENS[index % PLANT_GREENS.length];
  const bloom = BLOOMS[index % BLOOMS.length];

  useEffect(() => {
    Animated.timing(grow, {
      toValue: 1,
      duration: 520,
      delay,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, []);

  // Height climbs with tier; the trunk thickens only at the last one.
  const h = [34, 44, 54, 64][tier] * scale;
  const stemW = (tier === 3 ? 5.5 : 3) * scale;
  const leafSize = 9 * scale;

  const petal = (i, r, color, size) => (
    <View
      key={i}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ rotate: `${i * 72}deg` }, { translateY: -r }],
      }}
    />
  );

  return (
    <Animated.View
      style={{
        alignItems: 'center',
        justifyContent: 'flex-end',
        // Grow from the soil, not from the middle of the stem.
        transform: [
          { translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [h / 2, 0] }) },
          { scaleY: grow },
          { scaleX: grow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ],
        opacity: grow,
      }}
    >
      {/* crown */}
      {tier === 3 ? (
        <View style={{ width: 34 * scale, height: 26 * scale, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: 0, width: 22 * scale, height: 22 * scale, borderRadius: 22 * scale, backgroundColor: stemA }} />
          <View style={{ position: 'absolute', right: 0, width: 20 * scale, height: 20 * scale, borderRadius: 20 * scale, backgroundColor: stemB }} />
          <View style={{ width: 24 * scale, height: 24 * scale, borderRadius: 24 * scale, backgroundColor: stemA, marginBottom: 6 * scale }} />
          <View style={{ position: 'absolute', top: 4 * scale, width: 5 * scale, height: 5 * scale, borderRadius: 5, backgroundColor: bloom }} />
        </View>
      ) : tier === 2 ? (
        <View style={{ width: 22 * scale, height: 22 * scale, alignItems: 'center', justifyContent: 'center' }}>
          {[0, 1, 2, 3, 4].map((i) => petal(i, 6 * scale, bloom, 9 * scale))}
          <View style={{ width: 7 * scale, height: 7 * scale, borderRadius: 7, backgroundColor: '#F6EBD2' }} />
        </View>
      ) : tier === 1 ? (
        <View style={{ width: 11 * scale, height: 13 * scale, borderRadius: 11 * scale, backgroundColor: bloom }} />
      ) : (
        <View style={{ height: 2 * scale }} />
      )}

      {/* stem + a leaf on each side */}
      <View style={{ width: 26 * scale, height: h, alignItems: 'center' }}>
        <View style={{ width: stemW, height: h, borderRadius: stemW, backgroundColor: stemB }} />
        <View
          style={{
            position: 'absolute', top: h * 0.34, left: 26 * scale / 2 - leafSize - 1,
            width: leafSize * 1.5, height: leafSize,
            borderTopLeftRadius: leafSize, borderBottomRightRadius: leafSize,
            backgroundColor: stemA,
          }}
        />
        <View
          style={{
            position: 'absolute', top: h * 0.52, left: 26 * scale / 2 + 1,
            width: leafSize * 1.5, height: leafSize,
            borderTopRightRadius: leafSize, borderBottomLeftRadius: leafSize,
            backgroundColor: stemA,
          }}
        />
      </View>
    </Animated.View>
  );
}

/**
 * `points` is the total of everything that counts as showing up. `skyId` is the
 * collectible backdrop the patient has chosen.
 */
export default function Garden({ points = 0, skyId = 'dawn', style }) {
  const { plants, tier } = gardenFor(points);
  const sky = skyById(skyId);

  // Split across two depth rows, back row first so the front overlaps it.
  const perRow = Math.ceil(GARDEN_CAPACITY / 2);
  const back = Math.min(plants, perRow);
  const front = Math.max(0, plants - perRow);

  // Fixed slots, not `space-around`. With space-around every existing plant
  // slides sideways each time a new one appears, so the garden looks rearranged
  // rather than added to — the opposite of the feeling this is for.
  const row = (count, baseline, scale, opacity) => (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 14, right: 14, top: 0, height: baseline,
        flexDirection: 'row', alignItems: 'flex-end', opacity,
      }}
    >
      {Array.from({ length: perRow }, (_, i) => (
        <View key={`${scale}-${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          {i < count ? (
            <Plant tier={tier} index={scale < 1 ? i + 7 : i} scale={scale} delay={i * 55} />
          ) : null}
        </View>
      ))}
    </View>
  );

  return (
    <View style={[{ height: HEIGHT, borderRadius: 20, overflow: 'hidden' }, style]}>
      <LinearGradient colors={sky.colors} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1 }}>
        {/* soil */}
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: GROUND,
            backgroundColor: 'rgba(122, 96, 66, .34)',
            borderTopLeftRadius: 60, borderTopRightRadius: 46,
          }}
        />
        <View
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: GROUND * 0.55,
            backgroundColor: 'rgba(96, 74, 50, .30)',
          }}
        />

        {back > 0 && row(back, BACK_BASE, 0.72, 0.72)}
        {front > 0 && row(front, FRONT_BASE, 1, 1)}

        {plants === 0 && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: 46, height: 46, borderRadius: 23,
                backgroundColor: 'rgba(255,255,255,.42)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, opacity: 0.55 }} />
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}
