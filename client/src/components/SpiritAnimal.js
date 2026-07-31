import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { spiritById, spiritStage } from '../utils/spiritData';

// The spirit animals, drawn from plain Views — circles, capsules, border
// triangles, gradients and a lot of rotation. Same constraint as Garden.js: no
// SVG and no Lottie, so the whole cast ships over EAS Update instead of a
// native dependency.
//
// Everything is laid out on a 100x100 grid and multiplied by `size / 100`, so
// one component renders correctly at 44px in an invite card and at 190px on the
// reveal screen.
//
// WHAT MAKES THEM READ AS ANIMALS RATHER THAN SHAPES, in the order that it
// matters — this is the whole design of the file:
//
//   1. the eye      A solid black oval is a cartoon. An iris with a pupil, a
//                   dark rim, a shadow under the brow and two catchlights is an
//                   eye, and the face follows it. Slit pupils for the hunters.
//   2. shading      Every mass is a top-lit gradient (accent -> body -> dark)
//                   with a rim light along the top edge, so the body reads as
//                   round instead of flat.
//   3. silhouette   Ears, tails, necks and quills carry recognition at a
//                   glance — a rabbit is its ears, a crane is its neck.
//   4. fur          Small tufts breaking the outline, so the edge is not a
//                   perfect mathematical curve.
//
//   ...and none of it at the expense of the proportions, which stay firmly
//   infantile: big head, low eyes, short limbs, round everything. "Cute" is
//   mostly a pile of baby proportions, and detail sits on top of that rather
//   than replacing it.
//
// LAYOUT NOTE: ears, antlers, necks and tails stick out well past the head and
// body circles, and Android clips children that overflow their parent's bounds.
// So the head and body each live in a deliberately oversized box, and those
// parts are positioned in *box* coordinates. That is why the helpers take
// boxW/headTop rather than positioning relative to the circle they hang off.

const EYE = '#241D19';
const SHINE = 'rgba(255,255,255,.95)';

// Hunters get a vertical slit. It is two lines of code and it is the single
// clearest signal of "predator" in the whole drawing.
const SLIT_PUPILS = new Set(['cat', 'fox']);

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

/** Capsule/ellipse — the shape almost every body part is made of. */
function Blob({ w, h, color, style }) {
  return <View style={[{ width: w, height: h, borderRadius: Math.min(w, h) / 2, backgroundColor: color }, style]} />;
}

/** A top-lit mass. The gradient is what stops everything looking like paper. */
function Mass({ w, h, radius, palette, style, children }) {
  return (
    <LinearGradient
      colors={[palette.accent, palette.body, palette.dark]}
      locations={[0, 0.52, 1]}
      start={{ x: 0.35, y: 0 }}
      end={{ x: 0.62, y: 1 }}
      style={[{ width: w, height: h, borderRadius: radius ?? Math.min(w, h) / 2, overflow: 'hidden' }, style]}
    >
      {children}
    </LinearGradient>
  );
}

// --- head parts -------------------------------------------------------------

function Ears({ kind, head, boxW, headTop, palette, u, sway, detailed }) {
  if (!kind || kind === 'none') return null;

  const lean = sway.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] });
  const leanBack = sway.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-5deg'] });

  // Pointed family: fox, cat, wolf (wide and upright), owl and squirrel tufts
  // (narrow, tilted out).
  if (kind === 'pointed' || kind === 'tufts') {
    const tuft = kind === 'tufts';
    const w = head * (tuft ? 0.32 : 0.44);
    const h = head * (tuft ? 0.46 : 0.54);
    const offset = head * (tuft ? 0.18 : 0.3);
    const tilt = tuft ? 22 : 12;
    return (
      <>
        {[-1, 1].map((side) => (
          <Animated.View
            key={side}
            style={{
              position: 'absolute',
              top: headTop - h * 0.62,
              left: boxW / 2 + side * offset - w / 2,
              transform: [{ rotate: `${side * tilt}deg` }, { rotate: side < 0 ? leanBack : lean }],
            }}
          >
            <Triangle w={w} h={h} color={palette.dark} />
            <Triangle w={w * 0.52} h={h * 0.52} color={palette.accent} style={{ position: 'absolute', bottom: 0, left: w * 0.24 }} />
            {detailed && <Triangle w={w * 0.3} h={h * 0.3} color={palette.deep} style={{ position: 'absolute', bottom: 0, left: w * 0.35, opacity: 0.4 }} />}
          </Animated.View>
        ))}
      </>
    );
  }

  // Rabbit: the ears ARE the animal. Tall, upright, leaning apart.
  if (kind === 'tall') {
    const w = head * 0.24;
    const h = head * 0.98;
    return (
      <>
        {[-1, 1].map((side) => (
          <Animated.View
            key={side}
            style={{
              position: 'absolute',
              top: headTop - h * 0.72,
              left: boxW / 2 + side * head * 0.2 - w / 2,
              transform: [{ rotate: `${side * 11}deg` }, { rotate: side < 0 ? leanBack : lean }],
            }}
          >
            <Blob w={w} h={h} color={palette.dark} />
            <Blob w={w * 0.5} h={h * 0.78} color="#E6C4C0" style={{ position: 'absolute', top: h * 0.12, left: w * 0.25, opacity: 0.85 }} />
          </Animated.View>
        ))}
      </>
    );
  }

  // Deer: tall soft ears plus antler nubs — what stops it reading as "rabbit".
  if (kind === 'long') {
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
            <Blob w={u * 2} h={head * 0.3} color={palette.deep} />
            <Blob
              w={u * 1.5}
              h={head * 0.14}
              color={palette.deep}
              style={{ position: 'absolute', top: 0, left: side > 0 ? u * 1.4 : -u * 1.4, transform: [{ rotate: `${side * 40}deg` }] }}
            />
          </View>
        ))}
      </>
    );
  }

  // Hedgehog / otter: barely there, low on the skull.
  if (kind === 'small') {
    const d = head * 0.24;
    return (
      <>
        {[-1, 1].map((side) => (
          <View
            key={side}
            style={{
              position: 'absolute',
              top: headTop + head * 0.06,
              left: boxW / 2 + side * head * 0.42 - d / 2,
            }}
          >
            <Blob w={d} h={d} color={palette.dark} />
            <Blob w={d * 0.5} h={d * 0.5} color={palette.deep} style={{ position: 'absolute', top: d * 0.25, left: d * 0.25, opacity: 0.6 }} />
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
          <Blob w={d * 0.52} h={d * 0.52} color={palette.accent} style={{ position: 'absolute', top: d * 0.24, left: d * 0.24 }} />
        </Animated.View>
      ))}
    </>
  );
}

function Muzzle({ kind, head, palette, u, detailed }) {
  if (kind === 'beak' || kind === 'longbeak') {
    const long = kind === 'longbeak';
    const w = head * (long ? 0.22 : 0.21);
    const h = w * (long ? 2.6 : 1.3);
    return (
      <View style={{ position: 'absolute', top: head * (long ? 0.44 : 0.5), left: head / 2 - w / 2 }}>
        <Triangle w={w} h={h} color={long ? '#D8B15E' : '#D9A441'} style={{ transform: [{ rotate: '180deg' }] }} />
        {detailed && (
          <View style={{ position: 'absolute', top: h * 0.18, left: w * 0.42, width: Math.max(0.8, u * 0.5), height: h * 0.5, backgroundColor: '#00000022' }} />
        )}
      </View>
    );
  }

  if (kind === 'snout') {
    const w = head * 0.42;
    const h = head * 0.3;
    return (
      <View style={{ position: 'absolute', top: head * 0.5, left: head / 2 - w / 2, alignItems: 'center' }}>
        <Blob w={w} h={h} color={palette.belly} />
        {detailed && <Blob w={w * 0.7} h={h * 0.4} color="#00000010" style={{ position: 'absolute', bottom: 0, left: w * 0.15 }} />}
        <Blob w={w * 0.34} h={w * 0.26} color={EYE} style={{ position: 'absolute', top: h * 0.12 }} />
        {detailed && (
          <Blob w={w * 0.12} h={w * 0.08} color={SHINE} style={{ position: 'absolute', top: h * 0.16, left: w * 0.36, opacity: 0.75 }} />
        )}
      </View>
    );
  }

  // round — cat, bear, turtle, rabbit, otter
  const w = head * 0.46;
  const h = head * 0.27;
  const bar = Math.max(1, u * 0.7);
  return (
    <View style={{ position: 'absolute', top: head * 0.49, left: head / 2 - w / 2, alignItems: 'center' }}>
      <Blob w={w} h={h} color={palette.belly} />
      {detailed && <Blob w={w * 0.72} h={h * 0.42} color="#00000010" style={{ position: 'absolute', bottom: 0, left: w * 0.14 }} />}
      <Blob w={w * 0.28} h={w * 0.2} color={EYE} style={{ position: 'absolute', top: 0 }} />
      {detailed && (
        <Blob w={w * 0.1} h={w * 0.07} color={SHINE} style={{ position: 'absolute', top: w * 0.03, left: w * 0.4, opacity: 0.8 }} />
      )}
      {/* two short bars angled apart: a mouth, without needing a curve */}
      <View style={{ position: 'absolute', top: h * 0.44, flexDirection: 'row', gap: u * 0.6 }}>
        <View style={{ width: w * 0.2, height: bar, borderRadius: u, backgroundColor: EYE, opacity: 0.42, transform: [{ rotate: '18deg' }] }} />
        <View style={{ width: w * 0.2, height: bar, borderRadius: u, backgroundColor: EYE, opacity: 0.42, transform: [{ rotate: '-18deg' }] }} />
      </View>
    </View>
  );
}

/**
 * The eye. Five stacked layers, and worth every one of them: rim, iris, pupil,
 * brow shadow, catchlights. This is where almost all the perceived realism in
 * the whole component lives.
 */
function Eyes({ head, build, palette, blink, wide, expression, slit, detailed, hasDisc }) {
  const eyeD = head * build.eyeRatio * 1.7;
  const gap = head * build.eyeGap;
  // Eyes sit *below* the middle of the head. The single strongest cue in the
  // drawing: high eyes read as adult, low eyes read as infant.
  const eyeTop = head * 0.36;
  const smiling = expression === 'happy' || expression === 'eating';

  return (
    <>
      {[-1, 1].map((side) => (
        <View
          key={side}
          style={{
            position: 'absolute',
            top: eyeTop,
            left: head / 2 + side * gap - eyeD / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Owls and cranes get a pale facial disc — it is what makes a bird
              legible at small sizes. */}
          {hasDisc && <Blob w={eyeD * 1.7} h={eyeD * 1.7} color={palette.belly} style={{ position: 'absolute' }} />}

          {smiling ? (
            // A happy eye is an upward arc: a ring clipped to its top half.
            // RN has no arc primitive and this costs two views.
            <View style={{ width: eyeD * 1.2, height: eyeD * 0.6, overflow: 'hidden', alignItems: 'center' }}>
              <View
                style={{
                  width: eyeD * 1.2,
                  height: eyeD * 1.2,
                  borderRadius: eyeD,
                  borderWidth: Math.max(1.4, eyeD * 0.2),
                  borderColor: EYE,
                  backgroundColor: 'transparent',
                }}
              />
            </View>
          ) : (
            <Animated.View
              style={{
                width: eyeD,
                height: eyeD,
                borderRadius: eyeD / 2,
                backgroundColor: EYE, // the rim / lash line
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                // Blink is a vertical squash, not an eyelid: one animated
                // value, and it reads correctly on all twelve animals.
                transform: [
                  { scaleY: blink },
                  { scale: wide.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
                ],
              }}
            >
              {/* iris */}
              <View
                style={{
                  width: eyeD * 0.86,
                  height: eyeD * 0.86,
                  borderRadius: eyeD,
                  backgroundColor: palette.iris,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* pupil — a slit for the hunters, round for everyone else */}
                <View
                  style={{
                    width: eyeD * (slit ? 0.26 : 0.5),
                    height: eyeD * (slit ? 0.78 : 0.5),
                    borderRadius: eyeD,
                    backgroundColor: EYE,
                  }}
                />
              </View>
              {/* shadow cast by the brow, across the top of the eye */}
              {detailed && (
                <View
                  style={{
                    position: 'absolute',
                    top: -eyeD * 0.34,
                    width: eyeD,
                    height: eyeD * 0.62,
                    borderRadius: eyeD,
                    backgroundColor: '#000000',
                    opacity: 0.2,
                  }}
                />
              )}
              {/* two catchlights: the big one is the light source, the small
                  opposite one is what makes the eye look wet */}
              <View
                style={{
                  position: 'absolute',
                  top: eyeD * 0.14,
                  left: eyeD * 0.17,
                  width: eyeD * 0.32,
                  height: eyeD * 0.32,
                  borderRadius: eyeD,
                  backgroundColor: SHINE,
                }}
              />
              {detailed && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: eyeD * 0.16,
                    right: eyeD * 0.15,
                    width: eyeD * 0.16,
                    height: eyeD * 0.16,
                    borderRadius: eyeD,
                    backgroundColor: SHINE,
                    opacity: 0.65,
                  }}
                />
              )}
            </Animated.View>
          )}
        </View>
      ))}

      {/* Blush, just under the eyes. Warms up when the animal is pleased. */}
      {[-1, 1].map((side) => (
        <View
          key={`cheek${side}`}
          style={{
            position: 'absolute',
            top: eyeTop + eyeD * 0.9,
            left: head / 2 + side * head * 0.33 - head * 0.1,
            width: head * 0.2,
            height: head * 0.11,
            borderRadius: head,
            backgroundColor: '#E2A0A0',
            opacity: smiling ? 0.55 : 0.34,
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
              opacity: 0.55,
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
const TAIL_ROOM = {
  bushy: 0.8, curl: 0.6, fan: 0.55, plume: 0.72, thick: 0.5,
  tuft: 0.3, puff: 0.34, stub: 0.25, none: 0,
};

function Tail({ kind, bodyW, bodyH, boxW, palette, sway, u }) {
  if (!kind || kind === 'none') return null;

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

  // Squirrel and crane: a big vertical plume curling up behind the body.
  if (kind === 'plume') {
    const w = bodyW * 0.5;
    const h = bodyH * 1.15;
    return wrap(
      <>
        <Blob w={w} h={h} color={palette.dark} style={{ transform: [{ rotate: '12deg' }] }} />
        <Blob w={w * 0.66} h={h * 0.72} color={palette.accent} style={{ position: 'absolute', top: h * 0.1, left: w * 0.2, opacity: 0.75 }} />
      </>,
      { left: bodyRight - w * 0.42, bottom: bodyH * 0.02 }
    );
  }

  // Otter: a thick tapering rudder, low and heavy.
  if (kind === 'thick') {
    const w = bodyW * 0.44;
    const h = bodyH * 0.32;
    return wrap(
      <Blob w={w} h={h} color={palette.dark} style={{ transform: [{ rotate: '-14deg' }] }} />,
      { left: bodyRight - w * 0.3, bottom: bodyH * 0.02 }
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

  // Rabbit: a round cotton puff.
  if (kind === 'puff') {
    const d = bodyW * 0.3;
    return wrap(
      <>
        <Blob w={d} h={d} color={palette.belly} />
        <Blob w={d * 0.5} h={d * 0.5} color="#FFFFFF" style={{ position: 'absolute', top: d * 0.12, left: d * 0.18, opacity: 0.6 }} />
      </>,
      { left: bodyRight - d * 0.5, bottom: bodyH * 0.1 }
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
        {[[0.28, 0.3], [0.6, 0.24], [0.42, 0.48], [0.7, 0.52]].map(([x, y], i) => (
          <View
            key={i}
            style={{
              position: 'absolute', left: bodyW * x, top: bodyH * y,
              width: u * 2.4, height: u * 2.4, borderRadius: u * 2,
              backgroundColor: palette.belly, opacity: 0.85,
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
              position: 'absolute', left: bodyW * 0.08, top: bodyH * y,
              width: bodyW * (0.3 - i * 0.05), height: u * 1.5, borderRadius: u,
              backgroundColor: palette.deep, opacity: 0.55,
            }}
          />
        ))}
      </>
    );
  }

  // Wolf: a darker saddle over the shoulders and back.
  if (kind === 'saddle') {
    return (
      <View
        style={{
          position: 'absolute', left: bodyW * 0.08, top: -bodyH * 0.04,
          width: bodyW * 0.84, height: bodyH * 0.46,
          borderRadius: bodyW * 0.5,
          backgroundColor: palette.deep, opacity: 0.42,
        }}
      />
    );
  }

  // Hedgehog: quills. A row of overlapping triangles across the back, in two
  // staggered layers so the edge is spiky rather than serrated.
  if (kind === 'spikes') {
    return (
      <>
        <View
          style={{
            position: 'absolute', left: 0, right: 0, top: -bodyH * 0.06,
            height: bodyH * 0.6, borderRadius: bodyW * 0.5,
            backgroundColor: palette.dark,
          }}
        />
        {[0, 1].map((row) => (
          <View
            key={row}
            style={{
              position: 'absolute',
              left: bodyW * (row ? 0.1 : 0.04),
              top: bodyH * (row ? 0.12 : 0.02),
              flexDirection: 'row',
              gap: bodyW * 0.005,
            }}
          >
            {Array.from({ length: row ? 6 : 7 }, (_, i) => (
              <Triangle
                key={i}
                w={bodyW * 0.13}
                h={bodyH * 0.26}
                color={row ? palette.deep : palette.dark}
                style={{ transform: [{ rotate: `${(i - 3) * 7}deg` }] }}
              />
            ))}
          </View>
        ))}
      </>
    );
  }

  if (kind === 'chest') {
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
                width: u * 1.5, height: u * 0.9, borderRadius: u,
                backgroundColor: palette.deep, opacity: 0.3,
              }}
            />
          ))
        )}
      </>
    );
  }

  if (kind === 'shell') {
    return (
      <>
        <View
          style={{
            position: 'absolute', left: bodyW * 0.05, top: bodyH * 0.08,
            right: bodyW * 0.05, height: bodyH * 0.64,
            borderRadius: bodyW * 0.44, backgroundColor: palette.deep, opacity: 0.45,
          }}
        />
        {[[0.37, 0.18, 0.26], [0.15, 0.36, 0.2], [0.63, 0.36, 0.2], [0.29, 0.54, 0.18], [0.51, 0.54, 0.18]].map(
          ([x, y, s], i) => (
            <View
              key={i}
              style={{
                position: 'absolute', left: bodyW * x, top: bodyH * y,
                width: bodyW * s, height: bodyW * s * 0.82,
                borderRadius: bodyW * 0.05, backgroundColor: palette.accent, opacity: 0.9,
              }}
            />
          )
        )}
      </>
    );
  }

  return null;
}

/**
 * Tufts breaking the outline. A perfect mathematical curve reads as plastic;
 * three triangles hanging off the edge read as an animal. Skipped entirely at
 * small sizes, where they would just be noise.
 */
function Fur({ kind, w, h, palette, detailed }) {
  if (!detailed || !kind || kind === 'smooth') return null;
  const count = kind === 'shaggy' ? 5 : 3;
  const size = w * (kind === 'shaggy' ? 0.17 : 0.13);

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        const t = 0.42 + Math.floor(i / 2) * 0.2;
        return (
          <Triangle
            key={i}
            w={size}
            h={size * 1.5}
            color={palette.dark}
            style={{
              position: 'absolute',
              top: h * t,
              left: side < 0 ? -size * 0.45 : w - size * 0.55,
              transform: [{ rotate: `${side * 108}deg` }],
            }}
          />
        );
      })}
    </>
  );
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
 * @param id         spirit id from utils/spiritData
 * @param size       box size in px; everything scales off it
 * @param mood       'idle' | 'listening' | 'thinking' | 'happy'
 * @param expression 'idle' | 'happy' | 'eating'
 * @param pose       'stand' | 'walk' | 'lie'
 * @param aura       show the glow and the drifting motes
 * @param points     growth points, for the stage (or pass `stage` directly)
 * @param pulseKey   change this to make the animal hop (e.g. on tap)
 * @param flip       mirror it, to face the way it is walking
 */
export default function SpiritAnimal({
  id,
  size = 96,
  mood = 'idle',
  expression = 'idle',
  energy = 3,
  aura = true,
  points = 0,
  stage,
  pulseKey = 0,
  flip = false,
  pose = 'stand',
  style,
}) {
  const spirit = spiritById(id);
  const { palette, features, build } = spirit;
  const u = size / 100;
  const level = stage ?? spiritStage(points);

  // `energy` is the patient's last self-reported mood, 1..5 (hooks/useSpiritEnergy).
  //
  // It changes only *tempo*, never mood: on a low day the animal breathes and
  // blinks more slowly and moves less, which reads as settling down beside
  // someone. It never looks sad. See the long note in useSpiritEnergy for why
  // that distinction is the entire point — a companion that visibly deflates
  // when you report a bad day has turned into one more thing you are failing.
  const vigour = Math.max(1, Math.min(5, Number(energy) || 3));
  const pace = 1 + (3 - vigour) * 0.14; // >1 = slower, on the harder days
  const lidRest = vigour <= 2 ? 0.9 : 1; // a fraction heavy-lidded, not sad

  const walking = pose === 'walk';
  const lying = pose === 'lie';

  // AMPLITUDE FLOOR — why idle motion is not purely proportional to `size`.
  //
  // Everything here used to scale off `size` alone. At the reveal screen's
  // 170px that is fine; at the 66px the roaming companion renders at, a breath
  // of `size * 0.012` is 0.8px and a scale of 1.022 is 1.5px. Both round away
  // to nothing on a real display, which is why the companion was reported as
  // frozen — it genuinely was, visually, even though every loop was running.
  //
  // So motion gets a floor in device pixels. The animal breathes by at least
  // ~1.6px whatever size it is drawn at, and the small renders are the ones
  // that needed it: those are the ambient ones nobody is looking straight at,
  // where "is that alive?" has to be answerable from the corner of an eye.
  const lift = Math.max(1.6, size * 0.02);  // vertical travel of the breath, px
  const SWELL = 1.03;                       // scale at the top of the breath
  const step = Math.max(2.2, size * 0.06);  // how far a foot travels in a stride

  // Fine detail costs views and is invisible below about 60px, where the animal
  // is a thumbnail. One flag gates all of it.
  const detailed = size >= 60;

  const head = 58 * build.headRatio * u;
  const bodyW = 58 * build.bodyRatio * u;
  const bodyH = 50 * build.bodyRatio * u;

  // Oversized boxes so nothing that sticks out gets clipped on Android.
  const earRoom = head * 0.58;
  const neckH = build.neck ? head * build.neck + head * 0.2 : 0;
  const headBoxW = head * 1.9;
  const headBoxH = earRoom + head + neckH;
  const headTop = earRoom;
  const bodyBoxW = bodyW * (1 + (TAIL_ROOM[features.tail] ?? 0.25));

  const breathe = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const wide = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const chew = useRef(new Animated.Value(0)).current;
  const lid = useRef(new Animated.Value(1)).current;
  const stride = useRef(new Animated.Value(0)).current;
  const settle = useRef(new Animated.Value(lying ? 1 : 0)).current;
  const think = useRef(new Animated.Value(0)).current;

  // THE WALK CYCLE.
  //
  // One value looping 0 -> 1 per stride, and every limb reads it through a
  // different interpolation. That is the whole trick: a four-point output range
  // approximates a sine closely enough for a 10px foot, and antiphase is just
  // the same curve with the signs swapped, so both legs come off one driver
  // with no phase-shifted clocks to keep in sync.
  //
  // The legs alone are not what sells it. What sells it is that the body dips
  // twice per stride (once per footfall) and rolls a degree or so side to side
  // — weight transferring between feet. Without that the animal reads as a
  // sticker with scissoring legs.
  useEffect(() => {
    if (!walking) {
      stride.stopAnimation(() => stride.setValue(0));
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(stride, {
        toValue: 1,
        duration: 620 * pace,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [walking, pace]);

  // Lying down and getting up, over about half a second.
  useEffect(() => {
    Animated.timing(settle, {
      toValue: lying ? 1 : 0,
      duration: 480,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [lying]);

  // Eyelids settle to their resting height over a second, so a check-in saved
  // while the animal is on screen changes it gently rather than snapping.
  useEffect(() => {
    Animated.timing(lid, { toValue: lidRest, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [lidRest]);

  // Breath. ~4.4s a cycle: slower than a resting human breath, which is the
  // point — an animal breathing slightly slower than you is the oldest
  // co-regulation trick there is, and the same one BreathingScreen uses.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2100 * pace, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2300 * pace, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pace]);

  // Ears and tail, on a different period from the breath so the two never lock
  // into a mechanical-looking rhythm.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2900 * pace, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 3400 * pace, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pace]);

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

  // Blink, on a random gap — a creature that blinks exactly every three seconds
  // reads as a machine.
  useEffect(() => {
    let timer;
    let cancelled = false;
    const close = () =>
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.08, duration: 70 * pace, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110 * pace, useNativeDriver: true }),
      ]);
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        const double = Math.random() < 0.25;
        Animated.sequence(double ? [close(), Animated.delay(90), close()] : [close()]).start(() => {
          if (!cancelled) schedule();
        });
      }, (2200 + Math.random() * 3600) * pace);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pace]);

  // Listening: eyes widen and the head tilts, so the animal turns toward the
  // patient before they finish typing.
  useEffect(() => {
    Animated.timing(wide, {
      toValue: mood === 'listening' ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mood]);

  // Thinking: the opposite tilt from listening, and slower.
  //
  // Curiosity leans IN — toward whoever is talking. Thinking leans AWAY and up,
  // because attention has gone somewhere else. Two poses that are mirror images
  // of each other read instantly as two different states, which is the whole
  // reason the header animal is worth having: it is the only thing on that
  // screen that shows the difference between "I'm listening" and "I'm working
  // on it" without printing a word.
  useEffect(() => {
    Animated.timing(think, {
      toValue: mood === 'thinking' ? 1 : 0,
      duration: 460,
      easing: Easing.inOut(Easing.cubic),
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

  // Chewing: the head squashes on a ~4Hz cycle, which is what eating looks like
  // without needing a jaw.
  useEffect(() => {
    if (expression !== 'eating') {
      chew.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chew, { toValue: 1, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(chew, { toValue: 0, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [expression]);

  const moteCount = aura ? Math.min(5, 2 + level) : 0;
  const motes = useMemo(() => Array.from({ length: moteCount }, (_, i) => i), [moteCount]);

  const hasDisc = features.fur === 'feather';
  const hasWhiskers = spirit.id === 'cat' || spirit.id === 'fox' || spirit.id === 'otter';
  const hasLimbs = features.markings !== 'shell' && features.markings !== 'spikes';

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }, style]}>
      {aura && (
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size * 0.84, height: size * 0.84, borderRadius: size,
              backgroundColor: palette.aura,
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.1 + level * 0.03, 0.19 + level * 0.04] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }],
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size * 0.58, height: size * 0.58, borderRadius: size,
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
          position: 'absolute', bottom: size * 0.035,
          width: bodyW * 0.94, height: size * 0.045, borderRadius: size,
          backgroundColor: '#2A2320', opacity: 0.13,
        }}
      />

      <Animated.View
        style={{
          alignItems: 'center',
          transform: [
            // `flip` must come first: a scaleX(-1) applied after the rotate
            // would also mirror the head tilt.
            { scaleX: flip ? -1 : 1 },
            { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.08] }) },
            { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -lift] }) },
            // Two dips per stride, one per footfall — the body falling onto
            // each foot in turn. This is the part that reads as weight.
            {
              translateY: stride.interpolate({
                inputRange: [0, 0.25, 0.5, 0.75, 1],
                outputRange: [0, -step * 0.34, 0, -step * 0.34, 0],
              }),
            },
            // Lying down: settle toward the ground and squash slightly.
            { translateY: settle.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.1] }) },
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, SWELL] }) },
            { scaleY: settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) },
            // Weight rolling between the feet.
            {
              rotate: stride.interpolate({
                inputRange: [0, 0.25, 0.5, 0.75, 1],
                outputRange: ['0deg', '1.6deg', '0deg', '-1.6deg', '0deg'],
              }),
            },
            { rotate: wide.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-5deg'] }) },
            { rotate: think.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '7deg'] }) },
          ],
        }}
      >
        {/* Head, in an oversized box: ears and antlers need room above, and the
            neck (crane, deer, otter, turtle) hangs below. */}
        <Animated.View
          style={{
            width: headBoxW,
            height: headBoxH,
            marginBottom: -head * 0.24,
            zIndex: 2,
            transform: [
              { scaleY: chew.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] }) },
              { scaleX: chew.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
              // Lying: the head settles down and forward onto the body.
              { translateY: settle.interpolate({ inputRange: [0, 1], outputRange: [0, head * 0.1] }) },
              // The head bobs a beat behind the body while walking. A head
              // locked rigidly to the torso is the difference between a walk
              // cycle and a marching toy.
              {
                translateY: stride.interpolate({
                  inputRange: [0, 0.25, 0.5, 0.75, 1],
                  outputRange: [0, step * 0.16, 0, step * 0.16, 0],
                }),
              },
            ],
          }}
        >
          {/* neck first, so it paints behind the skull */}
          {neckH > 0 && (
            <Mass
              w={head * 0.36}
              h={neckH + head * 0.32}
              radius={head * 0.18}
              palette={palette}
              style={{ position: 'absolute', top: headTop + head * 0.68, left: headBoxW / 2 - head * 0.18 }}
            />
          )}

          <Ears
            kind={features.ears}
            head={head}
            boxW={headBoxW}
            headTop={headTop}
            palette={palette}
            u={u}
            sway={sway}
            detailed={detailed}
          />

          <Mass
            w={head}
            h={head}
            palette={palette}
            style={{ position: 'absolute', top: headTop, left: (headBoxW - head) / 2 }}
          >
            {/* rim light along the top of the skull */}
            {detailed && (
              <View
                style={{
                  position: 'absolute', top: head * 0.02, left: head * 0.16,
                  width: head * 0.6, height: head * 0.22, borderRadius: head,
                  backgroundColor: '#FFFFFF', opacity: 0.16,
                }}
              />
            )}
            {/* lighter mask across the lower face */}
            <View
              style={{
                position: 'absolute', top: head * 0.2, left: head * 0.1,
                width: head * 0.8, height: head * 0.68, borderRadius: head / 2,
                backgroundColor: palette.belly, opacity: hasDisc ? 0.72 : 0.28,
              }}
            />
            <Eyes
              head={head}
              build={build}
              palette={palette}
              // The resting lid height rides on top of the blink, so a low-energy
              // day reads as heavy-lidded without touching the blink itself.
              blink={Animated.multiply(blink, lid)}
              wide={wide}
              expression={expression}
              slit={SLIT_PUPILS.has(spirit.id)}
              detailed={detailed}
              hasDisc={hasDisc}
            />
            <Muzzle kind={features.muzzle} head={head} palette={palette} u={u} detailed={detailed} />
            {hasWhiskers && <Whiskers head={head} u={u} />}
          </Mass>

          {/* Crane's red crown sits on top of everything. */}
          {features.markings === 'crown' && (
            <View
              style={{
                position: 'absolute', top: headTop - head * 0.06,
                left: headBoxW / 2 - head * 0.14,
                width: head * 0.28, height: head * 0.16, borderRadius: head,
                backgroundColor: '#C4514E',
              }}
            />
          )}
        </Animated.View>

        {/* body, in its own oversized box so the tail is not clipped */}
        <View style={{ width: bodyBoxW, height: bodyH, alignItems: 'center' }}>
          <Tail kind={features.tail} bodyW={bodyW} bodyH={bodyH} boxW={bodyBoxW} palette={palette} sway={sway} u={u} />

          <View style={{ width: bodyW, height: bodyH }}>
            <Fur kind={features.fur} w={bodyW} h={bodyH} palette={palette} detailed={detailed} />
            <Mass w={bodyW} h={bodyH} palette={palette}>
              {/* belly, lit from below */}
              <View
                style={{
                  position: 'absolute', bottom: -bodyH * 0.1, left: bodyW * 0.18,
                  width: bodyW * 0.64, height: bodyH * 0.8, borderRadius: bodyW / 2,
                  backgroundColor: palette.belly, opacity: 0.8,
                }}
              />
              {detailed && (
                <View
                  style={{
                    position: 'absolute', top: bodyH * 0.02, left: bodyW * 0.14,
                    width: bodyW * 0.5, height: bodyH * 0.2, borderRadius: bodyW,
                    backgroundColor: '#FFFFFF', opacity: 0.14,
                  }}
                />
              )}
              <Markings kind={features.markings} bodyW={bodyW} bodyH={bodyH} palette={palette} u={u} />
            </Mass>
          </View>

          {/* Arms. They swing opposite the foot on the same side — that is how
              a real gait works, and getting it backwards is uncanny in a way
              people notice without being able to say why. */}
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
                  transformOrigin: 'top center',
                  transform: [
                    { rotate: `${side * 6}deg` },
                    {
                      rotate: stride.interpolate({
                        inputRange: [0, 0.25, 0.5, 0.75, 1],
                        outputRange: side < 0
                          ? ['0deg', '13deg', '0deg', '-13deg', '0deg']
                          : ['0deg', '-13deg', '0deg', '13deg', '0deg'],
                      }),
                    },
                    // Tucked in against the body when lying down.
                    { rotate: settle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${side * -14}deg`] }) },
                    { scaleY: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
                    { scaleY: settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) },
                  ],
                }}
              />
            ))}

          {/* Feet. Antiphase: one swings forward and lifts while the other is
              planted, then they trade. */}
          {[-1, 1].map((side) => {
            const forward = side < 0
              ? [0, step, 0, -step * 0.7, 0]
              : [0, -step * 0.7, 0, step, 0];
            const rises = side < 0
              ? [0, -step * 0.62, 0, 0, 0]
              : [0, 0, 0, -step * 0.62, 0];
            return (
              <Animated.View
                key={`foot${side}`}
                style={{
                  position: 'absolute',
                  bottom: -bodyH * 0.04,
                  left: bodyBoxW / 2 + side * bodyW * 0.22 - bodyW * 0.13,
                  width: bodyW * 0.26,
                  height: bodyH * 0.14,
                  borderRadius: bodyW,
                  backgroundColor: palette.dark,
                  overflow: 'hidden',
                  transform: [
                    { translateX: stride.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: forward }) },
                    { translateY: stride.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: rises }) },
                    // Folded forward under the body in the lying pose.
                    { translateX: settle.interpolate({ inputRange: [0, 1], outputRange: [0, side * -bodyW * 0.06] }) },
                    { scaleX: settle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.24] }) },
                  ],
                }}
              >
                {/* two toe lines — three views that do a surprising amount */}
                {detailed &&
                  [0.36, 0.64].map((t) => (
                    <View
                      key={t}
                      style={{
                        position: 'absolute', left: bodyW * 0.26 * t, top: 0,
                        width: Math.max(0.8, u * 0.5), height: '100%',
                        backgroundColor: palette.deep, opacity: 0.5,
                      }}
                    />
                  ))}
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}
