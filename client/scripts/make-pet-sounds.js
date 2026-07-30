/* eslint-disable no-console */
// Generates the spirit animals' voices into assets/sounds/pets/.
//
// Sibling of make-sounds.js, which owns the UI chimes. Kept separate because
// these are a different instrument with a different job: the chimes confirm that
// something happened, these are a creature answering you.
//
// They are NOT realistic animal noises, on purpose. A real recorded meow next to
// a flat geometric cat drawn from circles reads as a bug — and a genuine owl
// screech at 2am in a mental-health app is close to hostile. These are stylised
// creature voices in the Animal Crossing tradition: a short pitched warble with
// vibrato, characterised per animal by register and pitch contour. Cute, soft,
// unmistakably not a real animal.
//
// Run: node scripts/make-pet-sounds.js

const fs = require('fs');
const path = require('path');

const RATE = 22050;

// --- WAV container (same as make-sounds.js) ---------------------------------

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
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

// --- the voice ---------------------------------------------------------------

/**
 * One syllable of creature speech.
 *
 * `contour` maps 0..1 through the syllable to a pitch multiplier — that curve is
 * what carries the personality. A rising-then-falling contour is a question; a
 * flat one is a statement; a fast fall is a yip.
 *
 * `breath` mixes in noise, which is most of the difference between a bird and a
 * synthesiser. `harmonics` thickens the timbre for the larger animals.
 */
function syllable(out, at, { freq, dur, contour, vibrato = 5, vibratoDepth = 0.02, breath = 0, harmonics = [1, 0.3, 0.12], gain = 1 }) {
  const start = Math.floor(at * RATE);
  const len = Math.floor(dur * RATE);
  let phase = 0;

  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= out.length) break;
    const p = i / len;
    const t = i / RATE;

    // pitch: contour × a gentle vibrato
    const f = freq * contour(p) * (1 + Math.sin(2 * Math.PI * vibrato * t) * vibratoDepth);
    phase += (2 * Math.PI * f) / RATE;

    let sample = 0;
    harmonics.forEach((amp, h) => {
      sample += amp * Math.sin(phase * (h + 1));
    });
    if (breath > 0) sample += (Math.random() * 2 - 1) * breath;

    // Soft attack and release — a hard edge on a voice sounds like a click,
    // and this plays every time someone taps the animal.
    const attack = Math.min(1, p / 0.12);
    const release = Math.min(1, (1 - p) / 0.3);
    out[idx] += sample * attack * release * gain * 0.3;
  }
}

function finish(out, peak = 0.5) {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  const scale = max > 0 ? peak / max : 1;
  const fade = Math.floor(0.02 * RATE);
  for (let i = 0; i < out.length; i++) {
    const tail = i > out.length - fade ? (out.length - i) / fade : 1;
    out[i] *= scale * tail;
  }
  return out;
}

// --- contours ----------------------------------------------------------------

const flat = () => 1;
const rise = (p) => 1 + p * 0.28;
const fall = (p) => 1.22 - p * 0.3;
const riseFall = (p) => 1 + Math.sin(Math.PI * p) * 0.3;
const twoStep = (p) => (p < 0.5 ? 1 : 1.18);

// --- the six voices ----------------------------------------------------------
//
// Register tracks body size, the way it does in life: the bear sits an octave
// below the fox. That alone makes the six distinguishable with your eyes shut.

const voices = {
  // Owl — two soft low hoots, breathy, unhurried.
  owl() {
    const out = buffer(0.95);
    const shape = { freq: 330, dur: 0.3, contour: fall, vibrato: 4, vibratoDepth: 0.012, breath: 0.05, harmonics: [1, 0.16, 0.05] };
    syllable(out, 0.0, shape);
    syllable(out, 0.42, { ...shape, freq: 300, dur: 0.34, gain: 0.85 });
    return finish(out, 0.42);
  },

  // Deer — a short rising bleat, thin and a little uncertain.
  deer() {
    const out = buffer(0.5);
    syllable(out, 0, {
      freq: 500, dur: 0.34, contour: riseFall, vibrato: 13, vibratoDepth: 0.035,
      breath: 0.04, harmonics: [1, 0.34, 0.14],
    });
    return finish(out, 0.4);
  },

  // Fox — a quick bright yip, up and gone.
  fox() {
    const out = buffer(0.42);
    syllable(out, 0, { freq: 700, dur: 0.13, contour: rise, vibrato: 8, vibratoDepth: 0.02, harmonics: [1, 0.4, 0.2] });
    syllable(out, 0.16, { freq: 780, dur: 0.16, contour: fall, vibrato: 8, vibratoDepth: 0.02, harmonics: [1, 0.36, 0.16], gain: 0.8 });
    return finish(out, 0.4);
  },

  // Turtle — a low slow hum. Barely a voice at all, which is the joke.
  turtle() {
    const out = buffer(0.75);
    syllable(out, 0, {
      freq: 210, dur: 0.6, contour: twoStep, vibrato: 3.5, vibratoDepth: 0.015,
      breath: 0.03, harmonics: [1, 0.22, 0.08],
    });
    return finish(out, 0.38);
  },

  // Cat — the classic two-part meow: open, then drop.
  cat() {
    const out = buffer(0.6);
    syllable(out, 0, {
      freq: 540, dur: 0.44, contour: (p) => 1 + Math.sin(Math.PI * Math.min(1, p * 1.3)) * 0.26 - p * 0.14,
      vibrato: 16, vibratoDepth: 0.03, harmonics: [1, 0.45, 0.22, 0.09],
    });
    return finish(out, 0.42);
  },

  // Bear — a low rumble with a slow tremolo. Warm, not threatening.
  bear() {
    const out = buffer(0.85);
    syllable(out, 0, {
      freq: 155, dur: 0.7, contour: flat, vibrato: 7, vibratoDepth: 0.05,
      breath: 0.06, harmonics: [1, 0.5, 0.26, 0.12],
    });
    return finish(out, 0.44);
  },

  // Rabbit — barely there. Rabbits are nearly silent, so this is a single
  // tiny high squeak, over before you are sure you heard it.
  rabbit() {
    const out = buffer(0.28);
    syllable(out, 0, {
      freq: 920, dur: 0.11, contour: riseFall, vibrato: 18, vibratoDepth: 0.03,
      harmonics: [1, 0.22, 0.08],
    });
    return finish(out, 0.32);
  },

  // Wolf — a howl. Long, low, rising and then falling away, with the vibrato
  // widening at the tail the way a real one wavers.
  wolf() {
    const out = buffer(1.5);
    syllable(out, 0, {
      freq: 265, dur: 1.25,
      contour: (p) => (p < 0.25 ? 1 + p * 1.1 : 1.28 - (p - 0.25) * 0.34),
      vibrato: 6, vibratoDepth: 0.028, breath: 0.03,
      harmonics: [1, 0.42, 0.18, 0.07],
    });
    return finish(out, 0.44);
  },

  // Hedgehog — a snuffle, not a voice. Mostly breath with a faint pitch under
  // it, which is exactly what a hedgehog sounds like.
  hedgehog() {
    const out = buffer(0.55);
    [0, 0.14, 0.3].forEach((at, i) => {
      syllable(out, at, {
        freq: 300 + i * 22, dur: 0.12, contour: fall, vibrato: 9, vibratoDepth: 0.02,
        breath: 0.4, harmonics: [1, 0.2], gain: 1 - i * 0.15,
      });
    });
    return finish(out, 0.34);
  },

  // Otter — a bright chirp, repeated. Otters chatter constantly and sound
  // delighted doing it.
  otter() {
    const out = buffer(0.62);
    [0, 0.13, 0.27].forEach((at, i) => {
      syllable(out, at, {
        freq: 760 + i * 60, dur: 0.1, contour: rise, vibrato: 16, vibratoDepth: 0.03,
        harmonics: [1, 0.34, 0.14], gain: 1 - i * 0.1,
      });
    });
    return finish(out, 0.4);
  },

  // Crane — a bugle. Clear, unhurried, carrying: the one voice in the cast
  // that sounds like it expects to be heard a long way off.
  crane() {
    const out = buffer(1.05);
    syllable(out, 0, {
      freq: 520, dur: 0.82, contour: (p) => (p < 0.15 ? 1 + p * 0.9 : 1.13 - (p - 0.15) * 0.12),
      vibrato: 11, vibratoDepth: 0.022, breath: 0.04,
      harmonics: [1, 0.48, 0.24, 0.1],
    });
    return finish(out, 0.42);
  },

  // Squirrel — fast chatter. Four clipped chirps, each a touch higher, like
  // something scolding you from a branch.
  squirrel() {
    const out = buffer(0.55);
    [0, 0.085, 0.17, 0.255].forEach((at, i) => {
      syllable(out, at, {
        freq: 640 + i * 48, dur: 0.07, contour: fall, vibrato: 20, vibratoDepth: 0.025,
        harmonics: [1, 0.4, 0.2], gain: 1 - i * 0.08,
      });
    });
    return finish(out, 0.38);
  },
};

// --- feeding -----------------------------------------------------------------

const extras = {
  // A soft munch: two short low bursts, no bright edge.
  feed() {
    const out = buffer(0.42);
    [0, 0.16].forEach((at, i) => {
      const start = Math.floor(at * RATE);
      const len = Math.floor(0.13 * RATE);
      for (let n = 0; n < len; n++) {
        const idx = start + n;
        if (idx >= out.length) break;
        const p = n / len;
        // Noise through a crude one-pole lowpass, shaped by a soft hump.
        const env = Math.sin(Math.PI * p) * (i ? 0.75 : 1);
        out[idx] += (Math.random() * 2 - 1) * env * 0.5;
      }
    });
    // smooth it so it reads as "munch" rather than "static"
    let prev = 0;
    for (let i = 0; i < out.length; i++) {
      prev = prev * 0.82 + out[i] * 0.18;
      out[i] = prev;
    }
    return finish(out, 0.34);
  },

  // Delight — a fast three-note trill. Fires when a treat lands.
  happy() {
    const out = buffer(0.65);
    [
      [660, 0.0],
      [790, 0.075],
      [990, 0.15],
    ].forEach(([freq, at], i) => {
      syllable(out, at, {
        freq, dur: 0.26, contour: rise, vibrato: 14, vibratoDepth: 0.02,
        harmonics: [1, 0.3, 0.1], gain: 1 - i * 0.12,
      });
    });
    return finish(out, 0.44);
  },
};

const dir = path.join(__dirname, '..', 'assets', 'sounds', 'pets');
fs.mkdirSync(dir, { recursive: true });

const all = { ...extras };
Object.entries(voices).forEach(([id, make]) => {
  all[`voice-${id}`] = make;
});

for (const [name, make] of Object.entries(all)) {
  const wav = toWav(make());
  fs.writeFileSync(path.join(dir, `${name}.wav`), wav);
  console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB`);
}
console.log(`\nWrote ${Object.keys(all).length} files to ${dir}`);
