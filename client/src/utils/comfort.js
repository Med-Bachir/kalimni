// The line waiting when the app opens.
//
// WHY THIS IS NOT AN API CALL
//
// The obvious build is a quotes endpoint. It is the wrong one here, for four
// reasons that all point the same way:
//
//   1. Language. Kalimni is Arabic-first with French second. Every free
//      inspirational-quote API is English-only, so every line would arrive in
//      the wrong language for the primary audience.
//   2. Vetting. A quote API returns whatever is in its corpus. "No excuses."
//      "Winners never quit." That genre of line, shown unprompted to someone
//      who could not get out of bed today, does harm. Nothing reaches this
//      screen that was not written for this screen.
//   3. Connectivity. This card shows at launch, and the app is used at 3am on
//      bad connections. A comfort line that sometimes fails to load is worse
//      than no comfort line.
//   4. Cost and lifetime. No key to rotate, no rate limit, no vendor that can
//      disappear and take the feature with it.
//
// So the lines live in the i18n dictionaries under `comfort.lines`, written in
// both languages, and the pick happens on device. If a future version wants
// something personal, the right source is the existing companion service — it
// already knows the patient and is already safety-gated — not a public quote
// feed.
//
// TONE RULES for anyone adding lines: no imperatives, no advice, no promises
// that things will improve, no "at least". They are permissions and
// observations, not instructions. A good line is true on the worst day of
// someone's life.

import { translate } from '../i18n';

const MS_PER_DAY = 86400000;

// Local midnight, not UTC — the line must change when the patient's day does.
const epochDayOf = (date = new Date()) =>
  Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / MS_PER_DAY);

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * Index of today's line.
 *
 * Steps through the list by a fixed stride that is coprime with its length.
 * Because gcd(stride, length) is 1, ANY run of `length` consecutive days lands
 * on every line exactly once — not just calendar-aligned blocks. That is the
 * property that matters: the same sentence must never come back two days
 * running, whichever day someone happens to install the app.
 *
 * An earlier version varied the stride per cycle so each pass through the list
 * used a fresh order. It was abandoned deliberately: the guarantee then only
 * held inside an aligned cycle, and the line that ended one cycle could repeat
 * at the start of the next — roughly a one-in-`length` chance at every
 * boundary. Nobody will ever notice that the order of 36 lines repeats after
 * 36 days. Somebody will absolutely notice the same line twice in a row.
 *
 * The stride starts near the golden ratio of the length so consecutive days
 * land far apart in the list, which keeps neighbouring lines from feeling
 * thematically clustered.
 */
export function comfortIndex(length, date = new Date()) {
  if (!length || length < 1) return 0;

  const day = epochDayOf(date);
  const wrap = (n) => ((n % length) + length) % length;
  if (length < 3) return wrap(day);

  let stride = Math.max(1, Math.round(length * 0.6180339887));
  for (let i = 0; i < length && gcd(stride, length) !== 1; i++) {
    stride = (stride % length) + 1;
  }

  return wrap(day * stride);
}

/**
 * Today's comforting line for a language, or '' if the dictionary has none.
 *
 * Returns a plain string so callers can render it directly. Never throws: a
 * malformed dictionary yields an empty string and the card renders nothing,
 * rather than taking down the home screen.
 */
export function comfortLine(lang, date = new Date()) {
  const lines = translate(lang, 'comfort.lines');
  if (!Array.isArray(lines) || !lines.length) return '';
  const line = lines[comfortIndex(lines.length, date)];
  return typeof line === 'string' ? line : '';
}
