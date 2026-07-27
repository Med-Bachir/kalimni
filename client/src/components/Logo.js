import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from './ui';
import { colors } from '../theme/colors';

// The Kalimni mark: a speech bubble with a leaf growing inside it.
//
// "كلّمني" means "talk to me", and the product's whole premise is that talking
// is how you grow — so the mark is those two ideas in one shape. The two dots
// trailing off the corner do double duty as a speech tail and as seeds.
//
// Drawn entirely from React Native Views. No react-native-svg, no new native
// module, so the logo — and any later change to it — ships over EAS Update
// instead of needing a rebuild. Every dimension is a fraction of `size`, so one
// component serves the 32px header mark and the 112px splash mark with no
// second asset and no drift between them.
//
// brand/kalimni-logo.svg is the same geometry, and brand/gen.py is what
// generated it. If you change a constant here, change it there too.

// --- geometry, all as fractions of `size` -----------------------------------
const BUBBLE_H = 0.84;   // the bubble is a little wider than it is tall
const BUBBLE_R = 0.30;   // three round corners
const TAIL_R = 0.09;     // the one tight corner that reads as a speech tail
const LEAF_L = 0.325;    // side of the (pre-rotation) leaf square
const DIAG = 1.41421;    // rotating that square 45deg makes it DIAG times as tall
const SPINE_W = 0.030;   // thickness of the vein
const TILT = '-13deg';   // a leaf standing perfectly upright looks manufactured
const STEM_BOTTOM = 1.16; // how far past the leaf tip the stalk runs, in D units

/**
 * Leaf, vein and stalk as one unit.
 *
 * The leaf is a square with two opposite corners fully rounded, turned -45deg —
 * that puts its sharp points at top and bottom, so the long axis ends up
 * vertical and the vein along it is an UNROTATED bar. (Rotating the vein to
 * match the leaf's own -45deg is the obvious-looking thing to write and puts it
 * at right angles across the leaf instead of along it.)
 */
function LeafGroup({ size, leafColor, veinColor }) {
  const L = size * LEAF_L;
  const D = L * DIAG;

  return (
    <View
      style={{
        width: D,
        height: D * STEM_BOTTOM,
        // Recentre: the box is taller than the leaf because of the stalk, so
        // without this the leaf sits low in the bubble.
        transform: [{ translateY: -D * (STEM_BOTTOM - 1) / 2 }, { rotate: TILT }],
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: (D - L) / 2,
          top: (D - L) / 2,
          width: L,
          height: L,
          backgroundColor: leafColor,
          borderTopLeftRadius: L,
          borderBottomRightRadius: L,
          borderTopRightRadius: L * 0.14,
          borderBottomLeftRadius: L * 0.14,
          transform: [{ rotate: '-45deg' }],
        }}
      />
      {/* stalk — drawn before the vein so the vein reads as the top layer */}
      <View
        style={{
          position: 'absolute',
          left: D / 2 - size * SPINE_W * 0.42,
          top: D * 0.66,
          width: size * SPINE_W * 0.84,
          height: D * 0.50,
          borderRadius: size * SPINE_W,
          backgroundColor: leafColor,
        }}
      />
      {/* vein */}
      <View
        style={{
          position: 'absolute',
          left: D / 2 - size * SPINE_W / 2,
          top: D * 0.26,
          width: size * SPINE_W,
          height: D * 0.46,
          borderRadius: size * SPINE_W,
          backgroundColor: veinColor,
        }}
      />
    </View>
  );
}

/** The two seeds trailing off the bubble's tail corner. */
function Seeds({ size, color, style }) {
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: size * 0.045,
          top: size * BUBBLE_H + size * 0.03,
          flexDirection: 'row',
          alignItems: 'center',
          gap: size * 0.035,
        },
        style,
      ]}
    >
      <View style={{ width: size * 0.095, height: size * 0.095, borderRadius: size, backgroundColor: color }} />
      <View style={{ width: size * 0.055, height: size * 0.055, borderRadius: size, backgroundColor: color, opacity: 0.7 }} />
    </View>
  );
}

// 'brand' = gradient bubble with a light leaf, for light backgrounds.
// 'light' = white bubble with a brand leaf, for use on top of the brand colour.
const palette = (tone) =>
  tone === 'light'
    ? {
        bubble: ['#FFFFFF', '#EAF3F7'],
        leaf: colors.primary,
        vein: 'rgba(255,255,255,.55)',
        dot: '#FFFFFF',
      }
    : {
        bubble: [colors.primary, colors.primaryDark],
        leaf: '#FFFFFF',
        vein: 'rgba(41,98,126,.42)',
        dot: colors.primary,
      };

const bubbleStyle = (size) => ({
  width: size,
  height: size * BUBBLE_H,
  borderRadius: size * BUBBLE_R,
  borderBottomLeftRadius: size * TAIL_R,
  alignItems: 'center',
  justifyContent: 'center',
});

/** The mark at rest. */
export function LogoMark({ size = 96, tone = 'brand', style }) {
  const p = palette(tone);
  return (
    <View style={[{ width: size, height: size }, style]}>
      <LinearGradient colors={p.bubble} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={bubbleStyle(size)}>
        <LeafGroup size={size} leafColor={p.leaf} veinColor={p.vein} />
      </LinearGradient>
      <Seeds size={size} color={p.dot} />
    </View>
  );
}

/**
 * The mark's entrance, used by the splash.
 *
 * The sequence is the story in order: the bubble arrives, the leaf grows inside
 * it, the seeds drop. It runs once, takes about a second, and then holds
 * perfectly still — a logo that keeps moving would set exactly the wrong tone
 * for the screen behind it.
 *
 * `onSettled` fires on the last beat so the caller can time its own exit
 * without hard-coding these durations a second time.
 */
export function AnimatedLogoMark({ size = 128, tone = 'brand', onSettled }) {
  const bubble = useRef(new Animated.Value(0)).current;
  const leaf = useRef(new Animated.Value(0)).current;
  const seeds = useRef(new Animated.Value(0)).current;
  const p = palette(tone);

  useEffect(() => {
    Animated.sequence([
      Animated.spring(bubble, { toValue: 1, speed: 11, bounciness: 9, useNativeDriver: true }),
      Animated.timing(leaf, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(seeds, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onSettled?.());
  }, []);

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={{
          opacity: bubble,
          transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }],
        }}
      >
        <LinearGradient colors={p.bubble} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={bubbleStyle(size)}>
          {/* The leaf sprouts: it scales up from small and swings the last few
              degrees into its resting tilt, rather than simply fading in. */}
          <Animated.View
            style={{
              opacity: leaf,
              transform: [
                { scale: leaf.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] }) },
                { rotate: leaf.interpolate({ inputRange: [0, 1], outputRange: ['22deg', '0deg'] }) },
              ],
            }}
          >
            <LeafGroup size={size} leafColor={p.leaf} veinColor={p.vein} />
          </Animated.View>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={{
          opacity: seeds,
          transform: [{ translateY: seeds.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.08, 0] }) }],
        }}
      >
        <Seeds size={size} color={p.dot} />
      </Animated.View>
    </View>
  );
}

/**
 * Mark + wordmark, stacked. For the places where the brand introduces itself
 * rather than just sitting in a corner.
 */
export function LogoLockup({ size = 88, tone = 'brand', name, tagline }) {
  const fg = tone === 'light' ? '#FFFFFF' : colors.ink;
  const sub = tone === 'light' ? 'rgba(255,255,255,.78)' : colors.muted;
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <LogoMark size={size} tone={tone} />
      <View style={{ alignItems: 'center', gap: 8 }}>
        <T w="700" size={size * 0.40} color={fg}>{name}</T>
        {tagline ? (
          <T size={size * 0.185} color={sub} style={{ textAlign: 'center', lineHeight: size * 0.32 }}>
            {tagline}
          </T>
        ) : null}
      </View>
    </View>
  );
}

export default LogoMark;
