import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { spiritById, spiritStage } from '../utils/spiritData';

// The spirit animal, drawn from plain Views — circles, capsules, border
// triangles and a lot of rotation. Same constraint as Garden.js: no SVG and no
// Lottie, so the whole creature ships over EAS Update and costs about sixty
// views instead of a native dependency.
//
// Everything is laid out on a 100x100 grid and multiplied by `size / 100`, so
// one component renders correctly at 34px beside a chat bubble and at 190px on
// the reveal screen.
//
// The motion is the point. A still drawing at the top of a chat is a logo; the
// same drawing breathing, blinking on its own schedule and turning to look at
// you when you start typing is company. All of it is slow and small on
// purpose — this sits above a mental-health conversation, so nothing here is
// allowed to twitch, flash or demand attention.
//
// LAYOUT NOTE: ears, antlers and tails stick out well past the head and body
// circles, and Android clips children that overflow their parent's bounds. So
// the head and body each live in a deliberately oversized box, and those parts
// are positioned in *box* coordinates rather than relative to the circle they
// hang off. That is why the helpers below take boxW/boxH.

const EYE = '#2A2320';
const SHINE = 'rgba(255,255,255,.92)';

/** Upward-pointing triangle via the border trick — RN's only polygon. */
function Triangle({ w, h, color, style }) {
  return (
    <View
      style={[
        {
          width: 0,
          height: 0,
          backgroundColor: 'transparent',
          borderStyle: 'solid',
          borderLeftWidth: w / 2,
          borderRightWidth: w / 2,
          borderBottomWidth: h,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        },
        style,
      ]}
    />
  );
}

/** Capsule/ellipse helper — the shape almost every body part is made of. */
function Blob({ w, h, color, style }) {
  return <View style={[{ width: w, height: h, borderRadius: Math.min(w, h) / 2, backgroundColor: color }, style]} />;
}

// --- head parts -------------------------------------------------------------

function Ears({ kind, head, boxW, boxH, palette, u, sway }) {
  if (kind === 'none') return null;

  // Top of the head circle inside the box, since the circle is bottom-aligned.
  const headTop = boxH - head;
  const lean = sway.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] });
  const leanBack = sway.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-5deg'] });

  if (kind === 'pointed' || kind === 'tufts') {
    // Fox/cat ears sit wide and upright; owl tufts sit narrow and tilt outward.
    const w = head * (kind === 'tufts' ? 0.32 : 0.44);
    const h = head * (kind === 'tufts' ? 0.46 : 0.52);
    const offset = head * (kind === 'tufts' ? 0.17 : 0.3);
    const tilt = kind === 'tufts' ? 22 : 12;
    return (
      <>
        {[-1, 1].map((side) => (
          <Animated.View
            key={side}
            style={{
              position: 'absolute',
              top: headTop - h * 0.66,
              left: boxW / 2 + side * offset - w / 2,
              transform: [{ rotate: `${side * tilt}deg` }, { rotate: side < 0 ? leanBack : lean }],
            }}
          >
            <Triangle w={w} h={h} color={palette.dark} />
            <Triangle w={w * 0.5} h={h * 0.5} color={palette.accent} style={{ position: 'absolute', bottom: 0, left: w * 0.25 }} />
          </Animated.View>
        ))}
      </>
    );
  }

  if (kind === 'long') {
    // Deer: tall soft ears plus two antler nubs, which is what stops the
    // silhouette reading as "rabbit".
    const w = head * 0.26;
    const h = head * 0.68;
    return (
      <>
        {[-1, 1].map((side) => (
          <Animated.View
            key={side}
            style={{
              position: 'absolute',
              top: headTop - h * 0.5,
              left: boxW / 2 + side * head * 0.34 - w / 2,
              transform: [{ rotate: `${side * 26}deg` }, { rotate: side < 0 ? leanBack : lean }],
            }}
          >
            <Blob w={w} h={h} color={palette.dark} />
            <Blob w={w * 0.5} h={h * 0.6} color={palette.accent} style={{ position: 'absolute', top: h * 0.2, left: w * 0.25 }} />
          </Animated.View>
        ))}
        {[-1, 1].map((side) => (
          <View
            key={`antler${side}`}
            style={{
              position: 'absolute',
              top: headTop - head * 0.3,
              left: boxW / 2 + side * head * 0.15 - u,
              transform: [{ rotate: `${side * 16}deg` }],
            }}
          >
            <Blob w={u * 2} h={head * 0.3} color={palette.dark} />
            <Blob
              w={u * 1.5}
              h={head * 0.14}
              color={palette.dark}
              style={{ position: 'absolute', top: 0, left: side > 0 ? u * 1.4 : -u * 1.4, transform: [{ rotate: `${side * 40}deg` }] }}
            />
          </View>
        ))}
      </>
    );
  }

  // round — bear
  const d = head * 0.42;
  return (
    <>
      {[-1, 1].map((side) => (
        <Animated.View
          key={side}
          style={{
            position: 'absolute',
            top: headTop - d * 0.4,
            left: boxW / 2 + side * head * 0.36 - d / 2,
            transform: [{ rotate: side < 0 ? leanBack : lean }],
          }}
        >
          <Blob w={d} h={d} color={palette.dark} />
          <Blob w={d * 0.5} h={d * 0.5} color={palette.accent} style={{ position: 'absolute', top: d * 0.25, left: d * 0.25 }} />
        </Animated.View>
      ))}
    </>
  );
}

function Muzzle({ kind, head, palette, u }) {
  if (kind === 'beak') {
    // Owl: a downward triangle, which is the entire difference between "bird"
    // and "brown circle with eyes".
    const w = head * 0.21;
    return (
      <View style={{ position: 'absolute', top: head * 0.5, left: head / 2 - w / 2 }}>
        <Triangle w={w} h={w * 1.3} color="#D9A441" style={{ transform: [{ rotate: '180deg' }] }} />
      </View>
    );
  }

  if (kind === 'snout') {
    // Fox/deer: a tapered muzzle with the nose at the tip.
    const w = head * 0.42;
    const h = head * 0.3;
    return (
      <View style={{ position: 'absolute', top: head * 0.5, left: head / 2 - w / 2, alignItems: 'center' }}>
        <Blob w={w} h={h} color={palette.belly} />
        <Blob w={w * 0.32} h={w * 0.24} color={EYE} style={{ position: 'absolute', top: h * 0.16 }} />
      </View>
    );
  }

  // round — cat, bear, turtle
  const w = head * 0.46;
  const h = head * 0.27;
  const bar = Math.max(1, u * 0.7);
  return (
    <View style={{ position: 'absolute', top: head * 0.49, left: head / 2 - w / 2, alignItems: 'center' }}>
      <Blob w={w} h={h} color={palette.belly} />
      <Blob w={w * 0.26} h={w * 0.19} color={EYE} style={{ position: 'absolute', top: 0 }} />
      {/* two short bars angled apart: a mouth, without needing a curve */}
      <View style={{ position: 'absolute', top: h * 0.44, flexDirection: 'row', gap: u * 0.6 }}>
        <View style={{ width: w * 0.2, height: bar, borderRadius: u, backgroundColor: EYE, opacity: 0.45, transform: [{ rotate: '18deg' }] }} />
        <View style={{ width: w * 0.2, height: bar, borderRadius: u, backgroundColor: EYE, opacity: 0.45, transform: [{ rotate: '-18deg' }] }} />
      </View>
    </View>
  );
}

function Eyes({ head, build, palette, blink, wide, isOwl }) {
  const eyeD = head * build.eyeRatio * 1.7;
  const gap = head * build.eyeGap;

  return (
    <>
      {[-1, 1].map((side) => (
        <View
          key={side}
          style={{
            position: 'absolute',
            top: head * 0.33,
            left: head / 2 + side * gap - eyeD / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Owls get a pale ring around each eye — the facial disc is what
              makes an owl legible at 34px. */}
          {isOwl && (
            <Blob w={eyeD * 1.75} h={eyeD * 1.75} color={palette.belly} style={{ position: 'absolute' }} />
          )}
          <Animated.View
            style={{
              width: eyeD,
              height: eyeD,
              borderRadius: eyeD / 2,
              backgroundColor: EYE,
              // Blink is a vertical squash, not an eyelid: one animated value,
              // and it reads correctly on all six animals.
              transform: [
                { scaleY: blink },
                { scale: wide.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
              ],
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: eyeD * 0.16,
                left: eyeD * 0.2,
                width: eyeD * 0.32,
                height: eyeD * 0.32,
                borderRadius: eyeD,
                backgroundColor: SHINE,
              }}
            />
          </Animated.View>
        </View>
      ))}
      {/* Blush. Barely visible, and the thing that stops the face reading cold. */}
      {[-1, 1].map((side) => (
        <View
          key={`cheek${side}`}
          style={{
            position: 'absolute',
            top: head * 0.52,
            left: head / 2 + side * head * 0.32 - head * 0.09,
            width: head * 0.18,
            height: head * 0.1,
            borderRadius: head,
            backgroundColor: '#E2A0A0',
            opacity: 0.32,
          }}
        />
      ))}
    </>
  );
}

function Whiskers({ head, u }) {
  return (
    <>
      {[-1, 1].map((side) =>
        [0, 1, 2].map((i) => (
          <View
            key={`${side}-${i}`}
            style={{
              position: 'absolute',
              top: head * 0.58 + i * u * 1.5,
              left: side < 0 ? head * 0.02 : head * 0.68,
              width: head * 0.3,
              height: Math.max(1, u * 0.5),
              borderRadius: u,
              backgroundColor: '#FFFFFF',
              opacity: 0.5,
              transform: [{ rotate: `${side * (i - 1) * 9}deg` }],
            }}
          />
        ))
      )}
    </>
  );
}

// --- body parts -------------------------------------------------------------

/** Horizontal room the tail needs beyond the body circle, as a fraction of it. */
const TAIL_ROOM = { bushy: 0.8, curl: 0.6, fan: 0.55, tuft: 0.3, stub: 0.25, none: 0 };

function Tail({ kind, bodyW, bodyH, boxW, palette, sway, u }) {
  if (!kind || kind === 'none') return null;

  // Right edge of the body circle inside the box.
  const bodyRight = boxW / 2 + bodyW / 2;
  const swayRotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '8deg'] });

  const wrap = (children, { left, bottom }) => (
    <Animated.View style={{ position: 'absolute', left, bottom, transform: [{ rotate: swayRotate }] }}>
      {children}
    </Animated.View>
  );

  if (kind === 'bushy') {
    const w = bodyW * 0.46;
    const h = bodyH * 0.86;
    return wrap(
      <>
        <Blob w={w} h={h} color={palette.dark} style={{ transform: [{ rotate: '22deg' }] }} />
        <Blob w={w * 0.7} h={w * 0.7} color={palette.belly} style={{ position: 'absolute', top: -w * 0.08, left: w * 0.22 }} />
      </>,
      { left: bodyRight - w * 0.35, bottom: bodyH * 0.06 }
    );
  }

  if (kind === 'curl') {
    const w = u * 3.2;
    const h = bodyH * 0.85;
    return wrap(
      <>
        <Blob w={w} h={h} color={palette.dark} style={{ transform: [{ rotate: '16deg' }] }} />
        <Blob w={w * 2.2} h={w * 2.2} color={palette.dark} style={{ position: 'absolute', top: -w * 1.1, left: w * 0.5 }} />
        <Blob w={w * 1.1} h={w * 1.1} color={palette.belly} style={{ position: 'absolute', top: -w * 0.55, left: w * 1.05 }} />
      </>,
      { left: bodyRight - w * 1.6, bottom: bodyH * 0.16 }
    );
  }

  if (kind === 'fan') {
    const w = bodyW * 0.52;
    return wrap(
      <View
        style={{
          width: w,
          height: bodyH * 0.44,
          borderRadius: bodyW * 0.18,
          backgroundColor: palette.dark,
          transform: [{ rotate: '30deg' }],
        }}
      />,
      { left: bodyRight - w * 0.5, bottom: 0 }
    );
  }

  // tuft / stub
  const d = bodyW * (kind === 'tuft' ? 0.2 : 0.15);
  return wrap(<Blob w={d} h={d} color={palette.belly} />, { left: bodyRight - d * 0.4, bottom: bodyH * 0.4 });
}

function Markings({ kind, bodyW, bodyH, palette, u }) {
  if (kind === 'spots') {
    return (
      <>
        {[
          [0.28, 0.3],
          [0.6, 0.24],
          [0.42, 0.48],
          [0.7, 0.52],
        ].map(([x, y], i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: bodyW * x,
              top: bodyH * y,
              width: u * 2.4,
              height: u * 2.4,
              borderRadius: u * 2,
              backgroundColor: palette.belly,
              opacity: 0.85,
            }}
          />
        ))}
      </>
    );
  }

  if (kind === 'stripes') {
    return (
      <>
        {[0.24, 0.4, 0.56].map((y, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: bodyW * 0.08,
              top: bodyH * y,
              width: bodyW * (0.3 - i * 0.05),
              height: u * 1.5,
              borderRadius: u,
              backgroundColor: palette.dark,
              opacity: 0.7,
            }}
          />
        ))}
      </>
    );
  }

  if (kind === 'chest') {
    // Owl breast speckles: three staggered rows of short dashes.
    return (
      <>
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <View
              key={`${row}-${col}`}
              style={{
                position: 'absolute',
                left: bodyW * (0.3 + col * 0.14) + (row % 2 ? u * 1.4 : 0),
                top: bodyH * (0.34 + row * 0.15),
                width: u * 1.5,
                height: u * 0.9,
                borderRadius: u,
                backgroundColor: palette.dark,
                opacity: 0.32,
              }}
            />
          ))
        )}
      </>
    );
  }

  if (kind === 'shell') {
    // Turtle: the body IS the shell, so the plates carry the whole read.
    return (
      <>
        <View
          style={{
            position: 'absolute',
            left: bodyW * 0.05,
            top: bodyH * 0.08,
            right: bodyW * 0.05,
            height: bodyH * 0.64,
            borderRadius: bodyW * 0.44,
            backgroundColor: palette.dark,
            opacity: 0.5,
          }}
        />
        {[
          [0.37, 0.18, 0.26],
          [0.15, 0.36, 0.2],
          [0.63, 0.36, 0.2],
          [0.29, 0.54, 0.18],
          [0.51, 0.54, 0.18],
        ].map(([x, y, s], i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: bodyW * x,
              top: bodyH * y,
              width: bodyW * s,
              height: bodyW * s * 0.82,
              borderRadius: bodyW * 0.05,
              backgroundColor: palette.accent,
              opacity: 0.9,
            }}
          />
        ))}
      </>
    );
  }

  return null;
}

/** A mote of light drifting up and fading. Stage adds more of them. */
function Mote({ size, color, index, delay }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: 4200 + index * 400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const d = size * (0.022 + (index % 3) * 0.008);
  const startX = size * (0.22 + ((index * 0.23) % 0.58));

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: startX,
        bottom: size * 0.2,
        width: d,
        height: d,
        borderRadius: d,
        backgroundColor: color,
        opacity: value.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.75, 0.5, 0] }),
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.5] }) },
          { translateX: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, size * (index % 2 ? 0.05 : -0.05), 0] }) },
          { scale: value.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1, 0.7] }) },
        ],
      }}
    />
  );
}

// --- the animal -------------------------------------------------------------

/**
 * @param id       spirit id from utils/spiritData
 * @param size     box size in px; everything scales off it
 * @param mood     'idle' | 'listening' | 'happy'
 * @param aura     show the glow and the drifting motes
 * @param points   growth points, for the stage (or pass `stage` directly)
 * @param pulseKey change this to make the animal hop (e.g. on tap)
 */
export default function SpiritAnimal({
  id,
  size = 96,
  mood = 'idle',
  aura = true,
  points = 0,
  stage,
  pulseKey = 0,
  style,
}) {
  const spirit = spiritById(id);
  const { palette, features, build } = spirit;
  const u = size / 100;
  const level = stage ?? spiritStage(points);

  const head = 58 * build.headRatio * u;
  const bodyW = 58 * build.bodyRatio * u;
  const bodyH = 50 * build.bodyRatio * u;

  // Oversized boxes so nothing that sticks out gets clipped on Android.
  const headBoxW = head * 1.9;
  const headBoxH = head * 1.62;
  const bodyBoxW = bodyW * (1 + (TAIL_ROOM[features.tail] ?? 0.25));

  const breathe = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const wide = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  // Breath. ~4.4s a cycle: slower than a resting human breath, which is the
  // point — an animal breathing slightly slower than you is the oldest
  // co-regulation trick there is, and it is the same one BreathingScreen uses.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Ears and tail, on a different period from the breath so the two never lock
  // into a mechanical-looking rhythm.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 3400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (!aura) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 3600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [aura]);

  // Blink. Scheduled with a random gap rather than a fixed loop — a creature
  // that blinks exactly every three seconds reads as a machine.
  useEffect(() => {
    let timer;
    let cancelled = false;
    const close = () =>
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.08, duration: 70, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
      ]);
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        const double = Math.random() < 0.25;
        Animated.sequence(double ? [close(), Animated.delay(90), close()] : [close()]).start(() => {
          if (!cancelled) schedule();
        });
      }, 2200 + Math.random() * 3600);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Listening: eyes widen a little and the head tilts. Fires when the patient
  // starts typing, so the animal turns toward them before they finish.
  useEffect(() => {
    Animated.timing(wide, {
      toValue: mood === 'listening' ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mood]);

  // Hop — the one theatrical move, kept for genuine wins and for taps.
  useEffect(() => {
    if (mood !== 'happy' && !pulseKey) return;
    hop.setValue(0);
    Animated.sequence([
      Animated.spring(hop, { toValue: 1, speed: 15, bounciness: 16, useNativeDriver: true }),
      Animated.spring(hop, { toValue: 0, speed: 11, bounciness: 10, useNativeDriver: true }),
    ]).start();
  }, [mood, pulseKey]);

  const moteCount = aura ? Math.min(5, 2 + level) : 0;
  const motes = useMemo(() => Array.from({ length: moteCount }, (_, i) => i), [moteCount]);

  const isOwl = spirit.id === 'owl';
  const hasWhiskers = spirit.id === 'cat' || spirit.id === 'fox';
  const hasLimbs = features.markings !== 'shell';

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }, style]}>
      {/* aura */}
      {aura && (
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size * 0.84,
              height: size * 0.84,
              borderRadius: size,
              backgroundColor: palette.aura,
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.1 + level * 0.03, 0.19 + level * 0.04] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }],
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size * 0.58,
              height: size * 0.58,
              borderRadius: size,
              backgroundColor: palette.aura,
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.12] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1.04, 0.92] }) }],
            }}
          />
        </>
      )}
      {motes.map((i) => (
        <Mote key={i} size={size} color={palette.aura} index={i} delay={i * 700} />
      ))}

      {/* contact shadow — without it the animal floats */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: size * 0.035,
          width: bodyW * 0.94,
          height: size * 0.045,
          borderRadius: size,
          backgroundColor: '#2A2320',
          opacity: 0.13,
        }}
      />

      <Animated.View
        style={{
          alignItems: 'center',
          transform: [
            { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.08] }) },
            { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.012] }) },
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.022] }) },
            { rotate: wide.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-5deg'] }) },
          ],
        }}
      >
        {/* head. Bottom-aligned in an oversized box so ears and antlers have
            somewhere to be; the negative margin sinks it into the body. */}
        <View
          style={{
            width: headBoxW,
            height: headBoxH,
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginBottom: -head * 0.2,
            zIndex: 2,
          }}
        >
          <Ears kind={features.ears} head={head} boxW={headBoxW} boxH={headBoxH} palette={palette} u={u} sway={sway} />
          <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: palette.body }}>
            {/* facial disc / lighter mask */}
            <View
              style={{
                position: 'absolute',
                top: head * 0.15,
                left: head * 0.1,
                width: head * 0.8,
                height: head * 0.72,
                borderRadius: head / 2,
                backgroundColor: palette.belly,
                opacity: isOwl ? 0.8 : 0.32,
              }}
            />
            <Eyes head={head} build={build} palette={palette} blink={blink} wide={wide} isOwl={isOwl} />
            <Muzzle kind={features.muzzle} head={head} palette={palette} u={u} />
            {hasWhiskers && <Whiskers head={head} u={u} />}
          </View>
        </View>

        {/* body, in its own oversized box so the tail is not clipped */}
        <View style={{ width: bodyBoxW, height: bodyH, alignItems: 'center' }}>
          <Tail kind={features.tail} bodyW={bodyW} bodyH={bodyH} boxW={bodyBoxW} palette={palette} sway={sway} u={u} />
          <View
            style={{
              width: bodyW,
              height: bodyH,
              borderRadius: bodyW / 2,
              backgroundColor: palette.body,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                position: 'absolute',
                bottom: -bodyH * 0.1,
                left: bodyW * 0.18,
                width: bodyW * 0.64,
                height: bodyH * 0.8,
                borderRadius: bodyW / 2,
                backgroundColor: palette.belly,
                opacity: 0.85,
              }}
            />
            <Markings kind={features.markings} bodyW={bodyW} bodyH={bodyH} palette={palette} u={u} />
          </View>

          {/* wings / arms, and the feet that stop it reading as a balloon */}
          {hasLimbs &&
            [-1, 1].map((side) => (
              <Animated.View
                key={side}
                style={{
                  position: 'absolute',
                  top: bodyH * 0.16,
                  left: bodyBoxW / 2 + side * bodyW * 0.42 - bodyW * 0.12,
                  width: bodyW * 0.24,
                  height: bodyH * 0.6,
                  borderRadius: bodyW,
                  backgroundColor: palette.dark,
                  transform: [
                    { rotate: `${side * 6}deg` },
                    { scaleY: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
                  ],
                }}
              />
            ))}
          {[-1, 1].map((side) => (
            <View
              key={`foot${side}`}
              style={{
                position: 'absolute',
                bottom: -bodyH * 0.04,
                left: bodyBoxW / 2 + side * bodyW * 0.22 - bodyW * 0.13,
                width: bodyW * 0.26,
                height: bodyH * 0.14,
                borderRadius: bodyW,
                backgroundColor: palette.dark,
              }}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
