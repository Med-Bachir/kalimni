import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SpiritAnimal from './SpiritAnimal';
import { gardenFor, skyById, PLANT_GREENS, BLOOMS, GARDEN_CAPACITY } from '../utils/calmData';
import { skyImageFor } from '../utils/skyArt';

// The garden. Every plant is one thing the patient did — a check-in, a
// breathing round, a grounding session, a quest — and the plot only ever fills
// up. There is no watering, no decay, no "your garden misses you" notification.
//
// Drawn from plain Views: circles, capsules, rotated petals and border
// triangles. No SVG dependency, so it ships over EAS Update.
//
// It is styled, not photographic — but styled with enough detail to read as a
// place rather than a chart. What does that work, in order of how much it
// matters:
//
//   depth      three plant rows, each smaller, paler and washed toward the sky
//              colour, plus hills behind and blades in front
//   light      one light source per sky, placed and coloured to match, with a
//              warm wash and a vignette that agree with where it is
//   curvature  stems bend along a computed arc instead of standing as straight
//              bars, and every plant leans a little differently
//   motion     wind, drifting cloud, and something small and alive moving
//              through it
//
// The motion is the one thing to be careful with. Everything here is slow
// (three-to-six second cycles), small (a few degrees, a few pixels) and
// non-repeating enough that the eye does not lock onto a period. That is the
// difference between a garden that feels alive and a screen that fidgets — and
// this sits in the Calm Corner, so fidgeting is a bug.

const HEIGHT = 230;
const GROUND = 76;

// Baselines sit *below* the soil line, not on it — a plant whose stem stops
// exactly at the surface reads as hovering over the bed rather than planted in
// it. Each nearer row sits lower, which is what makes it read as nearer.
// Atmospheric perspective is done with row opacity alone: at 0.62 the sky
// colour reads straight through the far plants, which desaturates and lightens
// them exactly the way distance does. A white overlay would do the same job
// but would also paint a visible rectangle around each plant's bounding box.
const ROWS = [
  { key: 'back', base: HEIGHT - GROUND + 14, scale: 0.58, opacity: 0.62 },
  { key: 'mid', base: HEIGHT - GROUND + 30, scale: 0.79, opacity: 0.85 },
  { key: 'front', base: HEIGHT - GROUND + 50, scale: 1, opacity: 1 },
];
const PER_ROW = Math.ceil(GARDEN_CAPACITY / ROWS.length);

// Where the light is, per collectible sky. Position is a fraction of the
// canvas. `warm` is the wash laid over the whole scene so the plants and the
// sky share a light, which is most of why the layers read as one place.
const LIGHT = {
  dawn: { x: 0.2, y: 0.42, r: 30, core: '#FFF0D6', glow: '#F2C68A', warm: 'rgba(242,198,138,.20)' },
  morning: { x: 0.74, y: 0.24, r: 22, core: '#FFFBEF', glow: '#FBE6BC', warm: 'rgba(251,230,188,.13)' },
  noon: { x: 0.5, y: 0.16, r: 19, core: '#FFFFFF', glow: '#F6EFD8', warm: 'rgba(255,255,255,.10)' },
  rainy: null, // overcast: no disc at all, and the scene stays flat and cool
  dusk: { x: 0.79, y: 0.44, r: 26, core: '#FBD9BE', glow: '#E8A87C', warm: 'rgba(232,168,124,.20)' },
  night: { x: 0.76, y: 0.2, r: 15, core: '#EDF4F8', glow: '#9FC0D2', warm: 'rgba(90,130,160,.16)', moon: true },
  // A moon, not a sun — aurora is a night sky. Small and low-contrast so the
  // drifting curtains stay the thing you look at.
  aurora: { x: 0.82, y: 0.16, r: 11, core: '#EAF6F1', glow: '#A9D6C6', warm: 'rgba(140,200,182,.13)', moon: true },
  firstSun: { x: 0.22, y: 0.4, r: 32, core: '#FFEFD4', glow: '#E8A87C', warm: 'rgba(232,168,124,.22)' },
};

// Skies the hills and ground have to be lit for as night. Aurora belongs here
// now that it is genuinely dark — daytime-green hills under an aurora were the
// giveaway that the sky and the land had been designed separately.
const NIGHT_SKIES = ['night', 'dusk', 'aurora'];

// Deterministic pseudo-random from an integer. Every scatter below (pebbles,
// grass, leans) uses it, so the garden is identical on every render and after
// every reinstall — a plot that rearranges itself when you reopen the app is
// not a place you have been before.
const rand = (seed, salt = 0) => {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// --- sky --------------------------------------------------------------------

function Sun({ light, width }) {
  if (!light) return null;
  const cx = width * light.x;
  const cy = HEIGHT * light.y;
  const disc = (size, color, opacity) => (
    <View
      style={{
        position: 'absolute',
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: color,
        opacity,
      }}
    />
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      {disc(light.r * 4.4, light.glow, 0.16)}
      {disc(light.r * 2.6, light.glow, 0.26)}
      {disc(light.r * 1.5, light.core, 0.55)}
      {disc(light.r, light.core, 0.95)}
      {/* The moon is the sun with a bite taken out of it, in the sky colour. */}
      {light.moon && (
        <View
          style={{
            position: 'absolute',
            left: cx - light.r / 2 + light.r * 0.42,
            top: cy - light.r / 2 - light.r * 0.16,
            width: light.r,
            height: light.r,
            borderRadius: light.r,
            backgroundColor: '#2C4152',
            opacity: 0.85,
          }}
        />
      )}
    </View>
  );
}

/**
 * A starfield that breathes.
 *
 * Stars are drawn in three depths — a handful of bright near ones, a scatter of
 * mid ones, and a dusting of faint far ones — because a field of identical dots
 * reads as noise, and depth is most of what makes a night sky feel like a
 * volume rather than a texture.
 *
 * The twinkle is one shared driver rather than one animation per star. Each
 * star reads it through its own interpolation with its own phase, so forty
 * stars cost one animated value. Two stars ever pulsing in unison would be
 * instantly wrong, so the phases are spread by the same deterministic `rand`
 * that places them.
 */
function Stars({ width, show, twinkle }) {
  if (!show) return null;

  const LAYERS = [
    { count: 8, min: 1.7, span: 1.5, base: 0.72, reach: 0.5 },
    { count: 16, min: 1.1, span: 1.1, base: 0.46, reach: 0.44 },
    { count: 18, min: 0.7, span: 0.7, base: 0.24, reach: 0.3 },
  ];

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HEIGHT * 0.66 }}>
      {LAYERS.map((layer, li) =>
        Array.from({ length: layer.count }, (_, i) => {
          const seed = li * 100 + i;
          const size = layer.min + rand(seed, 3) * layer.span;
          // Phase: where in the shared cycle this star sits. Fractional offsets
          // let each one peak at a different moment off one clock.
          const phase = rand(seed, 5);
          const low = layer.base;
          const high = Math.min(1, layer.base + layer.reach);
          return (
            <Animated.View
              key={`${li}-${i}`}
              style={{
                position: 'absolute',
                left: width * (0.03 + rand(seed, 1) * 0.94),
                top: HEIGHT * (0.03 + rand(seed, 2) * 0.46),
                width: size,
                height: size,
                borderRadius: size,
                backgroundColor: '#FFFFFF',
                opacity: twinkle.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: phase > 0.5 ? [low, high, low] : [high, low, high],
                }),
              }}
            />
          );
        })
      )}
    </View>
  );
}

/**
 * The aurora: three bands of light leaning across the sky, drifting slowly and
 * independently.
 *
 * Each band is a rotated gradient that fades to transparent at BOTH ends, which
 * is the whole trick — a hard edge anywhere and it stops being light and starts
 * being a ribbon of plastic. They are deliberately wider than the canvas and
 * clipped by it, so no end is ever visible.
 *
 * This is the case for drawing rather than painting a sky: a still aurora is a
 * green smear, and a moving one is the only thing in the app that looks like
 * weather.
 */
function Aurora({ width, drift }) {
  const BANDS = [
    { top: 0.05, height: 46, lean: -11, colors: ['rgba(150,222,198,0)', 'rgba(168,232,206,.46)', 'rgba(150,222,198,0)'], travel: 16 },
    { top: 0.16, height: 34, lean: -6, colors: ['rgba(178,214,236,0)', 'rgba(196,228,244,.34)', 'rgba(178,214,236,0)'], travel: -12 },
    { top: 0.27, height: 26, lean: -15, colors: ['rgba(206,196,236,0)', 'rgba(214,206,242,.26)', 'rgba(206,196,236,0)'], travel: 9 },
  ];

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HEIGHT * 0.62, overflow: 'hidden' }}>
      {BANDS.map((band, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: HEIGHT * band.top,
            left: -width * 0.3,
            width: width * 1.6,
            height: band.height,
            transform: [
              { rotate: `${band.lean}deg` },
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-band.travel, band.travel],
                }),
              },
            ],
          }}
        >
          <LinearGradient
            colors={band.colors}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1, borderRadius: band.height }}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * The band of light along the horizon at sunrise.
 *
 * A sun disc alone does not read as dawn — what says "the sun just came up" is
 * the whole lower sky going warm and the light bleeding upward from behind the
 * hills. This sits under the hills and slowly brightens, which is the one
 * moving thing a painted sunrise could never do.
 */
function HorizonGlow({ colors: bandColors, pulse }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: HEIGHT * 0.3,
        height: HEIGHT - GROUND - HEIGHT * 0.3 + 18,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.92] }),
      }}
    >
      <LinearGradient
        colors={bandColors}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/**
 * A cloud, drifting a few pixels back and forth rather than crossing the whole
 * canvas — a cloud that exits the frame has to re-enter, and the pop when it
 * does is exactly the kind of thing the eye latches onto.
 */
function Cloud({ x, y, scale, opacity, drift, width }) {
  const puff = (w, h, left, top, o = 1) => (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        height: h,
        borderRadius: h,
        backgroundColor: '#FFFFFF',
        opacity: o,
      }}
    />
  );
  const s = scale;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: width * x,
        top: HEIGHT * y,
        opacity,
        transform: [{ translateX: drift }],
      }}
    >
      {puff(46 * s, 15 * s, 0, 8 * s, 0.9)}
      {puff(26 * s, 22 * s, 8 * s, 0, 0.85)}
      {puff(20 * s, 17 * s, 26 * s, 3 * s, 0.8)}
    </Animated.View>
  );
}

// --- ground -----------------------------------------------------------------

function Hills({ width, tint }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: GROUND - 8, height: 70 }}>
      {/* far ridge, then a nearer one — two silhouettes is all it takes to put
          a horizon behind the beds */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: -width * 0.14,
          width: width * 0.78,
          height: 56,
          borderTopLeftRadius: width * 0.4,
          borderTopRightRadius: width * 0.46,
          backgroundColor: tint,
          opacity: 0.3,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          right: -width * 0.18,
          width: width * 0.72,
          height: 42,
          borderTopLeftRadius: width * 0.44,
          borderTopRightRadius: width * 0.3,
          backgroundColor: tint,
          opacity: 0.42,
        }}
      />
      {/* a distant treeline on the nearer ridge */}
      {Array.from({ length: 7 }, (_, i) => {
        const h = 12 + rand(i, 9) * 12;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: 16 + rand(i, 11) * 8,
              left: width * (0.5 + i * 0.075),
              width: h * 0.8,
              height: h,
              borderRadius: h,
              backgroundColor: tint,
              opacity: 0.5,
            }}
          />
        );
      })}
    </View>
  );
}

function Soil({ width }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: GROUND }}>
      {/* the bed, with an asymmetric crown so the surface reads as a mound */}
      <View
        style={{
          position: 'absolute',
          left: -10,
          right: -10,
          top: 0,
          bottom: 0,
          backgroundColor: 'rgba(122, 96, 66, .34)',
          borderTopLeftRadius: 90,
          borderTopRightRadius: 64,
        }}
      />
      {/* a lit rim along the crown — the single strongest cue that the ground
          is a surface catching light and not a brown rectangle */}
      <View
        style={{
          position: 'absolute',
          left: -10,
          right: -10,
          top: 0,
          height: 7,
          backgroundColor: 'rgba(255,255,255,.22)',
          borderTopLeftRadius: 90,
          borderTopRightRadius: 64,
        }}
      />
      {/* deeper, cooler soil underneath */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: GROUND * 0.52,
          backgroundColor: 'rgba(96, 74, 50, .30)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: GROUND * 0.24,
          backgroundColor: 'rgba(74, 56, 38, .22)',
        }}
      />
      {/* pebbles and clods */}
      {Array.from({ length: 9 }, (_, i) => {
        const w = 3 + rand(i, 21) * 6;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: width * (0.04 + rand(i, 22) * 0.9),
              bottom: 4 + rand(i, 23) * (GROUND * 0.5),
              width: w,
              height: w * 0.62,
              borderRadius: w,
              backgroundColor: i % 2 ? 'rgba(60,44,30,.20)' : 'rgba(255,245,225,.14)',
            }}
          />
        );
      })}
    </View>
  );
}

/** A tuft of blades. Used along the crown and, larger, in the foreground. */
function Grass({ seed, height, color, wind, amplitude = 3 }) {
  const blades = [0, 1, 2, 3].slice(0, 3 + Math.round(rand(seed, 31)));
  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 1.5,
        transformOrigin: 'bottom center',
        transform: [
          { rotate: wind.interpolate({ inputRange: [0, 1], outputRange: [`${-amplitude}deg`, `${amplitude}deg`] }) },
        ],
      }}
    >
      {blades.map((b) => {
        const h = height * (0.6 + rand(seed, 40 + b) * 0.55);
        const lean = (rand(seed, 50 + b) - 0.5) * 26;
        return (
          <View
            key={b}
            style={{
              width: Math.max(1.4, height * 0.075),
              height: h,
              borderTopLeftRadius: height,
              borderTopRightRadius: height,
              backgroundColor: color,
              transformOrigin: 'bottom center',
              transform: [{ rotate: `${lean}deg` }],
            }}
          />
        );
      })}
    </Animated.View>
  );
}

// --- plants -----------------------------------------------------------------

/**
 * Points along a bending stem. Straight bars are the single biggest reason a
 * View-drawn plant reads as a bar chart, so the stem is five short capsules
 * laid along an arc, each rotated a little further than the last.
 *
 * Returns segment centres in "up from the base" coordinates.
 */
function stemPath(height, bendDeg, segments = 5) {
  const segH = height / segments;
  const points = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < segments; i++) {
    const angle = (bendDeg * (i + 0.5)) / segments;
    const rad = (angle * Math.PI) / 180;
    points.push({
      cx: x + (Math.sin(rad) * segH) / 2,
      cy: y + (Math.cos(rad) * segH) / 2,
      angle,
    });
    x += Math.sin(rad) * segH;
    y += Math.cos(rad) * segH;
  }
  return { points, segH, tipX: x, tipY: y };
}

function Petals({ count, radius, size, color, offset = 0 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: size,
            height: size * 1.35,
            borderRadius: size,
            backgroundColor: color,
            transform: [{ rotate: `${i * (360 / count) + offset}deg` }, { translateY: -radius }],
          }}
        />
      ))}
    </>
  );
}

// Square the crown is centred in, in unscaled units. Sized to the largest
// bloom (the tier-2 flower at 28) so every tier shares one anchor.
const BLOOM_BOX = 30;

/** The bloom at the tip. Detail scales with tier: bud, small flower, full flower. */
function Bloom({ tier, s, bloom, deep }) {
  if (tier === 0) {
    // a closed bud, still wrapped in its sepals
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 7 * s, height: 10 * s, borderRadius: 7 * s, backgroundColor: bloom, opacity: 0.9 }} />
        <View
          style={{
            position: 'absolute',
            bottom: -1 * s,
            width: 8 * s,
            height: 5 * s,
            borderRadius: 8 * s,
            backgroundColor: deep,
          }}
        />
      </View>
    );
  }

  if (tier === 1) {
    return (
      <View style={{ width: 20 * s, height: 20 * s, alignItems: 'center', justifyContent: 'center' }}>
        <Petals count={5} radius={5.4 * s} size={8 * s} color={bloom} />
        <View style={{ width: 6 * s, height: 6 * s, borderRadius: 6 * s, backgroundColor: '#F6EBD2' }} />
      </View>
    );
  }

  // tier 2 — two offset rings of petals, a shaded inner ring, and a seeded
  // centre. Layering is what separates "flower" from "asterisk".
  return (
    <View style={{ width: 28 * s, height: 28 * s, alignItems: 'center', justifyContent: 'center' }}>
      <Petals count={6} radius={7.6 * s} size={9.5 * s} color={deep} />
      <Petals count={6} radius={6.6 * s} size={8.5 * s} color={bloom} offset={30} />
      <View style={{ width: 8.5 * s, height: 8.5 * s, borderRadius: 9 * s, backgroundColor: '#F6EBD2' }} />
      <View style={{ position: 'absolute', width: 4.5 * s, height: 4.5 * s, borderRadius: 5 * s, backgroundColor: '#D9A441', opacity: 0.85 }} />
    </View>
  );
}

/** Tier 3 is a small tree, not a taller flower. */
function Tree({ s, index, greenA, greenB, bloom }) {
  const trunkH = 30 * s;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 46 * s, height: 40 * s, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 2 * s, top: 8 * s, width: 26 * s, height: 24 * s, borderRadius: 26 * s, backgroundColor: greenB }} />
        <View style={{ position: 'absolute', right: 1 * s, top: 11 * s, width: 24 * s, height: 22 * s, borderRadius: 24 * s, backgroundColor: greenB }} />
        <View style={{ position: 'absolute', top: 0, width: 28 * s, height: 26 * s, borderRadius: 28 * s, backgroundColor: greenA }} />
        <View style={{ position: 'absolute', top: 6 * s, left: 6 * s, width: 16 * s, height: 14 * s, borderRadius: 16 * s, backgroundColor: '#FFFFFF', opacity: 0.16 }} />
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: 8 * s + i * 12 * s,
              top: (12 + rand(index, 60 + i) * 14) * s,
              width: 4.5 * s,
              height: 4.5 * s,
              borderRadius: 5 * s,
              backgroundColor: bloom,
            }}
          />
        ))}
      </View>
      {/* tapered trunk: two capsules, the lower one wider */}
      <View style={{ width: 4 * s, height: trunkH * 0.55, backgroundColor: '#8A6A4A', marginTop: -4 * s }} />
      <View style={{ width: 6 * s, height: trunkH * 0.5, borderBottomLeftRadius: 3 * s, borderBottomRightRadius: 3 * s, backgroundColor: '#7A5C40' }} />
    </View>
  );
}

/** One plant: bending stem, alternating leaves, and a tier-appropriate crown. */
function Plant({ tier, index, scale = 1, delay = 0, wind }) {
  const grow = useRef(new Animated.Value(0)).current;
  const [greenA, greenB] = PLANT_GREENS[index % PLANT_GREENS.length];
  const bloom = BLOOMS[index % BLOOMS.length];
  const deep = BLOOMS[(index + 3) % BLOOMS.length];

  useEffect(() => {
    Animated.timing(grow, {
      toValue: 1,
      duration: 560,
      delay,
      easing: Easing.out(Easing.back(1.3)),
      useNativeDriver: true,
    }).start();
  }, []);

  const s = scale;
  // Per-plant variation, deterministic from position: height, which way it
  // bends, how hard it bends. Without this, eighteen identical plants read as
  // a bar chart no matter how well each one is drawn.
  const bend = (rand(index, 71) - 0.5) * 26;
  const jitter = 0.86 + rand(index, 72) * 0.3;
  const baseH = [34, 46, 56, 64][tier] * s * jitter;

  if (tier === 3) {
    return (
      <Animated.View
        style={{
          alignItems: 'center',
          transformOrigin: 'bottom center',
          transform: [
            { scaleY: grow },
            { scaleX: grow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            { rotate: wind.interpolate({ inputRange: [0, 1], outputRange: ['-1.6deg', '1.6deg'] }) },
          ],
          opacity: grow,
        }}
      >
        <Tree s={s} index={index} greenA={greenA} greenB={greenB} bloom={bloom} />
      </Animated.View>
    );
  }

  const { points, segH, tipX, tipY } = stemPath(baseH, bend);
  const stemW = 2.6 * s;
  const segLen = segH * 1.14; // overlap so the joints do not show

  // The box has to contain the crown, which is centred on the stem tip and so
  // sticks out half its own size past the top and sides. Sizing it to `baseH`
  // alone leaves Android clipping the top half of every flower.
  const boxW = 52 * s;
  const boxH = baseH + BLOOM_BOX * s * 0.6 + 4 * s;

  // Leaves hang off the middle of the stem, alternating sides.
  const leafAt = tier >= 2 ? [1, 2, 3] : [1, 3];
  const leafW = 15 * s;
  const leafH = 8.5 * s;

  return (
    <Animated.View
      style={{
        width: boxW,
        height: boxH,
        alignItems: 'center',
        transformOrigin: 'bottom center',
        transform: [
          { scaleY: grow },
          { scaleX: grow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { rotate: wind.interpolate({ inputRange: [0, 1], outputRange: ['-2.6deg', '2.6deg'] }) },
        ],
        opacity: grow,
      }}
    >
      {points.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: boxW / 2 + p.cx - stemW / 2,
            bottom: p.cy - segLen / 2,
            width: stemW,
            height: segLen,
            borderRadius: stemW,
            backgroundColor: i < 2 ? greenB : greenA,
            transform: [{ rotate: `${p.angle}deg` }],
          }}
        />
      ))}

      {leafAt.map((pi, n) => {
        const p = points[pi];
        const side = n % 2 === 0 ? -1 : 1;
        return (
          <View
            key={`leaf${pi}`}
            style={{
              position: 'absolute',
              left: boxW / 2 + p.cx + (side < 0 ? -leafW : 0),
              bottom: p.cy - leafH / 2,
              width: leafW,
              height: leafH,
              // asymmetric radii make a teardrop out of a rectangle
              borderTopLeftRadius: side < 0 ? leafH : leafH * 0.25,
              borderBottomRightRadius: side < 0 ? leafH : leafH * 0.25,
              borderTopRightRadius: side < 0 ? leafH * 0.25 : leafH,
              borderBottomLeftRadius: side < 0 ? leafH * 0.25 : leafH,
              backgroundColor: n % 2 ? greenA : greenB,
              transform: [{ rotate: `${side * (18 + rand(index, 80 + n) * 16)}deg` }],
            }}
          >
            {/* midrib — one pale line, and the leaf stops being a blob */}
            <View
              style={{
                position: 'absolute',
                top: leafH * 0.42,
                left: leafW * 0.14,
                width: leafW * 0.7,
                height: Math.max(0.8, 0.9 * s),
                borderRadius: 2,
                backgroundColor: '#FFFFFF',
                opacity: 0.28,
              }}
            />
          </View>
        );
      })}

      {/* The crown is centred ON the stem tip, so the box is a fixed square and
          the offsets subtract half of it. Positioning by `left: tipX` alone
          would hang every flower half its own width to the right of its stem. */}
      <View
        style={{
          position: 'absolute',
          left: boxW / 2 + tipX - BLOOM_BOX * s / 2,
          bottom: tipY - (BLOOM_BOX * s) / 2 + 4 * s,
          width: BLOOM_BOX * s,
          height: BLOOM_BOX * s,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bloom tier={tier} s={s} bloom={bloom} deep={deep} />
      </View>
    </Animated.View>
  );
}

// --- ambient life -----------------------------------------------------------

/**
 * One small living thing moving through the scene: a butterfly by day, a
 * firefly at night. Three of them, on long unequal loops.
 */
function Critter({ index, width, night, color }) {
  const value = useRef(new Animated.Value(0)).current;
  const flap = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 1400),
        Animated.timing(value, { toValue: 1, duration: 9000 + index * 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 9600 + index * 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flap, { toValue: 1, duration: night ? 1500 : 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(flap, { toValue: 0, duration: night ? 1700 : 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [night]);

  const fromX = width * (0.12 + rand(index, 91) * 0.24);
  const toX = width * (0.55 + rand(index, 92) * 0.32);
  const y = HEIGHT - GROUND - 10 - rand(index, 93) * 46;

  const common = {
    position: 'absolute',
    left: fromX,
    top: y,
    transform: [
      { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, toX - fromX] }) },
      { translateY: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -14 - rand(index, 94) * 16, 4] }) },
    ],
  };

  if (night) {
    // firefly: a dot that breathes light instead of flapping
    const d = 3.4;
    return (
      <Animated.View pointerEvents="none" style={common}>
        <Animated.View
          style={{
            width: d * 3.2,
            height: d * 3.2,
            borderRadius: d * 3,
            backgroundColor: '#F7E6A8',
            opacity: flap.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.3] }),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View
            style={{
              width: d,
              height: d,
              borderRadius: d,
              backgroundColor: '#FFF6CE',
              opacity: flap.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            }}
          />
        </Animated.View>
      </Animated.View>
    );
  }

  // butterfly: two wings scaling on X, which reads as flapping without needing
  // a second drawing
  const w = 5;
  return (
    <Animated.View pointerEvents="none" style={common}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Animated.View
          style={{
            width: w,
            height: w * 1.5,
            borderRadius: w,
            backgroundColor: color,
            opacity: 0.85,
            transform: [{ scaleX: flap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }],
          }}
        />
        <View style={{ width: 1.4, height: w * 1.2, backgroundColor: '#5A4632', opacity: 0.7 }} />
        <Animated.View
          style={{
            width: w,
            height: w * 1.5,
            borderRadius: w,
            backgroundColor: color,
            opacity: 0.85,
            transform: [{ scaleX: flap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }],
          }}
        />
      </View>
    </Animated.View>
  );
}

// --- the resident -----------------------------------------------------------

const PET_SIZE = 68;

/**
 * The spirit animal, living in the garden rather than parked in the corner of
 * it.
 *
 * It used to be pinned to `right: 12`, which made it read as a sticker on the
 * picture. Now it strolls along the near edge of the bed, turns to face the way
 * it is going, and stops for a while wherever it arrives — the legs only cycle
 * while it is actually travelling.
 *
 * The wander is bounded to the bed's width so it can never walk off the canvas,
 * and it starts from wherever the last stroll ended rather than from a fixed
 * point, so reopening the screen does not teleport it home.
 */
function GardenSpirit({ id, width, points, energy, pulse, onPress }) {
  const vigour = Math.max(1, Math.min(5, Number(energy) || 3));
  const pace = 1 + (3 - vigour) * 0.14;

  const span = Math.max(1, width - PET_SIZE - 24);
  const x = useRef(new Animated.Value(span * 0.72)).current;
  const at = useRef(span * 0.72);
  const timer = useRef(null);
  const [walking, setWalking] = useState(false);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const stroll = () => {
      if (cancelled) return;
      // Low-mood days: shorter trips, closer to where it already is. Same
      // "match, never mourn" rule the rest of the companion follows.
      const reach = span * (vigour <= 2 ? 0.4 : 0.85);
      const target = Math.max(0, Math.min(span, at.current + (Math.random() * 2 - 1) * reach));
      const distance = Math.abs(target - at.current);

      // Too short to be worth walking — wait and pick again, rather than
      // shuffling a few pixels.
      if (distance < 12) {
        timer.current = setTimeout(stroll, 2400 * pace);
        return;
      }

      setFlip(target < at.current);
      at.current = target;
      setWalking(true);
      Animated.timing(x, {
        toValue: target,
        duration: (1400 + distance * 26) * pace,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (cancelled || !finished) return;
        setWalking(false);
        timer.current = setTimeout(stroll, (2200 + Math.random() * 4200) * pace);
      });
    };

    timer.current = setTimeout(stroll, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [span, pace, vigour]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 12,
        bottom: GROUND * 0.16,
        transform: [{ translateX: x }],
      }}
    >
      <Pressable onPress={onPress} disabled={!onPress} hitSlop={8}>
        <SpiritAnimal
          id={id}
          size={PET_SIZE}
          points={points}
          energy={vigour}
          pulseKey={pulse}
          pose={walking ? 'walk' : 'stand'}
          flip={flip}
          aura={false}
        />
      </Pressable>
    </Animated.View>
  );
}

// --- the garden -------------------------------------------------------------

/**
 * `points` is the total of everything that counts as showing up. `skyId` is the
 * collectible backdrop the patient has chosen. `spiritId`, when set, sits the
 * patient's spirit animal on the near edge of the bed.
 */
export default function Garden({
  points = 0,
  skyId = 'dawn',
  spiritId,
  spiritEnergy = 3,
  onSpiritPress,
  spiritPulse = 0,
  style,
}) {
  // Measured, not passed in: the scatter positions (stars, pebbles, hills,
  // critter paths) are all fractions of the canvas width, and a hard-coded
  // guess puts half of them off-screen on a tablet. The default is only used
  // for the first frame, before onLayout reports.
  const [width, setWidth] = useState(330);
  const { plants, tier } = gardenFor(points);
  const sky = skyById(skyId);
  // `in`, not `??`: the rainy sky maps to null on purpose (overcast — no disc,
  // no warm wash), and `??` would quietly hand it the dawn sun instead.
  const light = skyId in LIGHT ? LIGHT[skyId] : LIGHT.dawn;
  const night = NIGHT_SKIES.includes(skyId);

  // Three wind values rather than one per plant: eighteen loops would be
  // eighteen native animations for an effect nobody can consciously see. Three
  // phases is enough that the rows never sway in lockstep.
  const wind = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const drift = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  // Drivers for the three code-drawn skies. One value each, shared by every
  // element in that sky — see the notes on Stars and Aurora for why forty
  // stars still only cost one animation.
  const twinkle = useRef(new Animated.Value(0)).current;
  const curtain = useRef(new Animated.Value(0)).current;
  const sunrise = useRef(new Animated.Value(0)).current;

  // The painting for this sky, or null when the sky is one we draw ourselves.
  const art = skyImageFor(skyId);
  const drawn = !art;

  useEffect(() => {
    const loops = [
      // Slow on purpose. A sky that shimmers is a screensaver; these should be
      // things you only notice if you sit and look at them.
      Animated.loop(
        Animated.sequence([
          Animated.timing(twinkle, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(twinkle, { toValue: 0, duration: 3100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(curtain, { toValue: 1, duration: 11000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(curtain, { toValue: 0, duration: 13000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(sunrise, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(sunrise, { toValue: 0, duration: 6400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      ...wind.map((value, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 500),
            Animated.timing(value, { toValue: 1, duration: 3400 + i * 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(value, { toValue: 0, duration: 3800 + i * 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        )
      ),
      ...drift.map((value, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(value, { toValue: 1, duration: 16000 + i * 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(value, { toValue: 0, duration: 17000 + i * 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        )
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  // Fixed slots, not `space-around`. With space-around every existing plant
  // slides sideways each time a new one appears, so the garden looks
  // rearranged rather than added to — the opposite of the feeling this is for.
  //
  // Filled front row first, then middle, then back: the first plant a new
  // patient earns should be the big one at the front, not a pale sprout on the
  // horizon.
  const rowCounts = useMemo(() => {
    let left = plants;
    const counts = {};
    ['front', 'mid', 'back'].forEach((key) => {
      counts[key] = Math.max(0, Math.min(PER_ROW, left));
      left -= counts[key];
    });
    return counts;
  }, [plants]);

  // Absolute plant index per row, so a plant keeps its colour as the garden
  // grows around it.
  const rowOffset = { front: 0, mid: PER_ROW, back: PER_ROW * 2 };

  const cloudDrifts = drift.map((value) => value.interpolate({ inputRange: [0, 1], outputRange: [-10, 12] }));

  return (
    <View
      style={[{ height: HEIGHT, borderRadius: 20, overflow: 'hidden' }, style]}
      onLayout={(e) => {
        const measured = Math.round(e.nativeEvent.layout.width);
        if (measured > 0 && measured !== width) setWidth(measured);
      }}
    >
      <View style={{ flex: 1 }}>
        {/* The gradient stays underneath even when a painting covers it. The
            painting sits at 94%, so a trace of the app's own palette shows
            through and binds the bitmap to the theme instead of letting it
            float on top as a foreign object. */}
        <LinearGradient
          colors={sky.colors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {art && (
          <Image
            source={art}
            resizeMode="cover"
            style={[StyleSheet.absoluteFill, { opacity: 0.94 }]}
          />
        )}

        {/* Night and aurora are drawn, not painted — see utils/skyArt.js for
            why those two and firstSun were the right ones to keep in code. */}
        <Stars width={width} show={drawn && (skyId === 'night' || skyId === 'aurora')} twinkle={twinkle} />
        {skyId === 'aurora' && <Aurora width={width} drift={curtain} />}
        {skyId === 'firstSun' && (
          <HorizonGlow
            colors={['rgba(247,225,201,0)', 'rgba(244,201,158,.55)', 'rgba(232,168,124,.85)']}
            pulse={sunrise}
          />
        )}

        {/* Same reasoning as the clouds: the paintings already carry their own
            light, so a second disc floating over one reads as two suns. The
            warm wash further down still runs for every sky — that is what keeps
            the plants lit to match whichever backdrop is showing. */}
        {drawn && <Sun light={light} width={width} />}

        {/* Painted skies bring their own clouds. Drawing more on top of them
            gives every cloud a twin a few pixels away. */}
        {drawn && (
          <>
            <Cloud x={0.06} y={0.1} scale={1} opacity={night ? 0.2 : 0.5} drift={cloudDrifts[0]} width={width} />
            <Cloud x={0.58} y={0.05} scale={0.7} opacity={night ? 0.14 : 0.38} drift={cloudDrifts[1]} width={width} />
            <Cloud x={0.34} y={0.22} scale={0.5} opacity={night ? 0.1 : 0.28} drift={cloudDrifts[2]} width={width} />
          </>
        )}

        <Hills width={width} tint={night ? '#22333F' : '#7E9A86'} />
        <Soil width={width} />

        {/* plant rows, far to near */}
        {ROWS.map((row) => {
          const count = rowCounts[row.key];
          if (!count) return null;
          return (
            <View
              key={row.key}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                top: 0,
                height: row.base,
                flexDirection: 'row',
                alignItems: 'flex-end',
                opacity: row.opacity,
              }}
            >
              {Array.from({ length: PER_ROW }, (_, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                  {i < count ? (
                    <Plant
                      tier={tier}
                      index={rowOffset[row.key] + i}
                      scale={row.scale}
                      delay={i * 55 + rowOffset[row.key] * 6}
                      wind={wind[i % wind.length]}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}

        {/* grass along the crown of the bed */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: GROUND - 12,
            height: 16,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            paddingHorizontal: 6,
          }}
        >
          {Array.from({ length: 16 }, (_, i) => (
            <Grass key={i} seed={i} height={9 + rand(i, 33) * 7} color={night ? '#3E5A4A' : '#6FA383'} wind={wind[i % wind.length]} amplitude={2.5} />
          ))}
        </View>

        {/* The spirit animal, living on the near edge of the bed. Tappable
            when the caller gives it somewhere to go — the garden is where most
            people will notice it is a thing you can visit. */}
        {spiritId ? (
          <GardenSpirit
            id={spiritId}
            width={width}
            points={points}
            energy={spiritEnergy}
            pulse={spiritPulse}
            onPress={onSpiritPress}
          />
        ) : null}

        {/* something alive moving through it */}
        {[0, 1, 2].map((i) => (
          <Critter key={i} index={i} width={width} night={night} color={BLOOMS[i % BLOOMS.length]} />
        ))}

        {/* foreground blades — in front of everything, and the cheapest depth
            cue in the whole scene */}
        <View pointerEvents="none" style={{ position: 'absolute', left: -2, bottom: -2 }}>
          <Grass seed={101} height={30} color={night ? '#223A2E' : '#4F8A67'} wind={wind[0]} amplitude={3.5} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', right: 4, bottom: -4 }}>
          <Grass seed={102} height={24} color={night ? '#223A2E' : '#4F8A67'} wind={wind[2]} amplitude={4} />
        </View>

        {/* one light wash over the whole scene, so sky and plants agree */}
        {light ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: light.warm }} />
        ) : null}
        {/* vignette: darker at the base, so the eye settles on the beds */}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'transparent', 'rgba(30,40,36,.16)']}
          locations={[0, 0.62, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />

        {plants === 0 && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: GROUND * 0.5 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: 'rgba(255,255,255,.42)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#4F8A67', opacity: 0.6 }} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
