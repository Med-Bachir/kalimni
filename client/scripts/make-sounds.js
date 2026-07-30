/* eslint-disable no-console */
// Generates the app's UI sounds as 16-bit mono WAV files into assets/sounds/.
//
// Synthesised rather than sourced, for three reasons: no licence to track, the
// files are a few KB each, and the palette can be tuned as one system — every
// sound below is built from the same soft-bell voice on the same pentatonic
// scale, so they read as one instrument rather than five unrelated dings.
//
// Run: node scripts/make-sounds.js
//
// The output is committed. This script exists so the sounds can be re-tuned
// later without hunting for whatever tool made them.

const fs = require('fs');
const path = require('path');

const RATE = 22050; // plenty for short chimes; halves the file size vs 44.1k

// --- WAV container ----------------------------------------------------------

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // channels = mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// --- voices -----------------------------------------------------------------

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

/**
 * A struck bell. Partials are slightly stretched (2.01, 3.02…) rather than
 * exact harmonics — that inharmonicity is most of what makes a bell sound like
 * metal instead of an organ. Higher partials decay faster, which is what makes
 * the tail go soft instead of staying bright.
 */
function bell(out, at, freq, dur, gain = 1) {
  const start = Math.floor(at * RATE);
  const len = Math.floor(dur * RATE);
  const partials = [
    [1.0, 1.0, 1.0],
    [2.01, 0.34, 1.7],
    [3.02, 0.14, 2.6],
    [4.16, 0.06, 3.6],
  ];
  const attack = Math.floor(0.006 * RATE); // 6ms — soft edge, no click

  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= out.length) break;
    const t = i / RATE;
    let sample = 0;
    for (const [ratio, amp, decayMul] of partials) {
      sample += amp * Math.sin(2 * Math.PI * freq * ratio * t) * Math.exp((-t / (dur * 0.32)) * decayMul);
    }
    const env = i < attack ? i / attack : 1;
    out[idx] += sample * env * gain * 0.24;
  }
}

/** Low sine swell under a chime, so the reveal has some floor to it. */
function pad(out, at, freq, dur, gain = 1) {
  const start = Math.floor(at * RATE);
  const len = Math.floor(dur * RATE);
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= out.length) break;
    const t = i / RATE;
    const swell = Math.sin(Math.PI * (i / len)); // fade in and back out
    out[idx] += Math.sin(2 * Math.PI * freq * t) * swell * gain * 0.16;
  }
}

/** Bubble pop: a fast downward pitch sweep with a breath of noise on the front. */
function pop(out, at, dur, gain = 1) {
  const start = Math.floor(at * RATE);
  const len = Math.floor(dur * RATE);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= out.length) break;
    const p = i / len;
    const freq = 760 * Math.exp(-2.6 * p); // 760Hz -> ~56Hz
    phase += (2 * Math.PI * freq) / RATE;
    const env = Math.exp(-5.5 * p);
    const noise = i < len * 0.14 ? (Math.random() * 2 - 1) * 0.35 * (1 - i / (len * 0.14)) : 0;
    out[idx] += (Math.sin(phase) + noise) * env * gain * 0.5;
  }
}

// --- shaping ----------------------------------------------------------------

/** Peak-normalise, then fade the last 25ms so the file cannot end on a click. */
function finish(out, peak = 0.5) {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  const scale = max > 0 ? peak / max : 1;
  const fade = Math.floor(0.025 * RATE);
  for (let i = 0; i < out.length; i++) {
    const tail = i > out.length - fade ? (out.length - i) / fade : 1;
    out[i] *= scale * tail;
  }
  return out;
}

// --- the palette ------------------------------------------------------------
//
// One scale for everything: C major pentatonic. Pentatonic has no semitone
// clashes, so overlapping notes cannot sound sour no matter how they land.

const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5, D6: 1174.66, G4: 392.0, C4: 261.63 };

const sounds = {
  // Finished an exercise: three notes up. The whole thing is under a second —
  // a long fanfare after a two-minute breathing round is a joke at the user's
  // expense.
  complete() {
    const out = buffer(1.35);
    bell(out, 0.0, N.C5, 1.1);
    bell(out, 0.1, N.E5, 1.05, 0.9);
    bell(out, 0.2, N.G5, 1.15, 0.85);
    return finish(out, 0.46);
  },

  // Ticked a quest: one soft note. Deliberately smaller than complete() —
  // these happen three times a day and must never start to grate.
  quest() {
    const out = buffer(0.75);
    bell(out, 0, N.G5, 0.65, 0.85);
    bell(out, 0.015, N.D6, 0.5, 0.28);
    return finish(out, 0.34);
  },

  // Saved a daily check-in. Two notes, warm, resolving downward — an
  // acknowledgement, not a reward.
  checkin() {
    const out = buffer(0.9);
    bell(out, 0, N.A5, 0.6, 0.8);
    bell(out, 0.11, N.E5, 0.75, 0.85);
    return finish(out, 0.36);
  },

  // The spirit animal appears. The one genuinely magical moment in the app, so
  // it gets a low swell, a rising figure and a shimmer on top.
  reveal() {
    const out = buffer(2.2);
    pad(out, 0, N.C4, 1.9, 1);
    bell(out, 0.05, N.C5, 1.4);
    bell(out, 0.22, N.E5, 1.35, 0.92);
    bell(out, 0.39, N.G5, 1.4, 0.88);
    bell(out, 0.56, N.C6, 1.5, 0.8);
    bell(out, 0.78, N.D6, 1.2, 0.42);
    bell(out, 0.95, N.A5, 1.1, 0.36);
    return finish(out, 0.55);
  },

  // A milestone in the journey. Bigger than complete(), still calm.
  milestone() {
    const out = buffer(2.0);
    pad(out, 0, N.G4, 1.5, 0.8);
    bell(out, 0.0, N.G5, 1.2);
    bell(out, 0.14, N.C6, 1.25, 0.9);
    bell(out, 0.28, N.D6, 1.3, 0.8);
    bell(out, 0.5, N.G5, 1.4, 0.6);
    return finish(out, 0.5);
  },

  // A popped bubble. Very short and very quiet: it can fire twenty times in a
  // minute, so it has to sit under everything else.
  pop() {
    const out = buffer(0.16);
    pop(out, 0, 0.15);
    return finish(out, 0.3);
  },
};

const dir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(dir, { recursive: true });

for (const [name, make] of Object.entries(sounds)) {
  const wav = toWav(make());
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, wav);
  console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB`);
}
console.log(`\nWrote ${Object.keys(sounds).length} files to ${dir}`);
