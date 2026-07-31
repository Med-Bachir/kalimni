// Presence: what a streak looks like when it is not allowed to punish anyone.
//
// The app records a day key every time the patient does anything that counts —
// a check-in, a calm exercise, a quest. From that log we derive four numbers,
// and the difference between them is the whole design:
//
//   daysPresent  lifetime distinct days. Monotonic. Never resets.
//   current      consecutive days ending today or yesterday.
//   best         the longest run ever achieved. Monotonic. Never resets.
//   returns      how many times the patient came back after 3+ days away.
//
// `current` is the only one that can fall, and the UI never announces when it
// does — there is no "you lost your streak" state anywhere in this app. It
// simply starts counting again, quietly, while `best` keeps the record of what
// was already done and `returns` treats the gap itself as an achievement.
//
// The reasoning, stated once so nobody re-adds a punishing streak later: the
// week a person is too flattened to open a mental health app is the week that
// app matters most. Greeting them with a reset counter tells them they failed
// at recovering. That is not a growth mechanic, it is a reason to uninstall.

import { dayKey } from './calmData';

export const PRESENCE_KEEP_DAYS = 400; // a year of history is plenty; bound the array
const GAP_FOR_RETURN = 3;              // days away before coming back counts as a return

const MS_PER_DAY = 86400000;

// Parse 'YYYY-MM-DD' as a LOCAL date. `new Date('2026-07-30')` parses as UTC
// and silently shifts the day for anyone west of Greenwich, which would corrupt
// every run calculation below.
const parseDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const daysBetween = (a, b) => Math.round((b - a) / MS_PER_DAY);

/** Normalise, dedupe and sort a day log into ascending valid keys. */
export const normaliseDays = (days = []) =>
  Array.from(new Set(days.filter((d) => parseDay(d))))
    .sort()
    .slice(-PRESENCE_KEEP_DAYS);

/**
 * Everything the UI and the badge tests need, from the day log alone.
 *
 * `today` is injectable so this is testable without mocking the clock.
 */
export function presenceFor(days = [], today = dayKey()) {
  const sorted = normaliseDays(days);
  const now = parseDay(today);

  if (!sorted.length || !now) {
    return { daysPresent: 0, current: 0, best: 0, returns: 0, week: [] };
  }

  let best = 0;
  let run = 0;
  let returns = 0;
  let previous = null;

  sorted.forEach((key) => {
    const date = parseDay(key);
    const gap = previous ? daysBetween(previous, date) : null;

    if (gap === 1) {
      run += 1;
    } else {
      // A fresh run. If the patient had been away a while, that return is the
      // thing worth counting — not the run they lost.
      if (gap !== null && gap > GAP_FOR_RETURN) returns += 1;
      run = 1;
    }

    if (run > best) best = run;
    previous = date;
  });

  // The trailing run only counts as "current" if it reaches today or yesterday.
  // Yesterday is included on purpose: someone who checks in every evening and
  // opens the app in the morning has not broken anything.
  const sinceLast = daysBetween(parseDay(sorted[sorted.length - 1]), now);
  const current = sinceLast <= 1 ? run : 0;

  return {
    daysPresent: sorted.length,
    current,
    best,
    returns,
    week: weekOf(sorted, now),
  };
}

/**
 * The last seven days as booleans, oldest first — the dot row the UI draws.
 *
 * A row of seven dots is honest in a way a single number is not: it shows four
 * good days and three blanks without ever calling the blanks a failure.
 */
function weekOf(sorted, now) {
  const present = new Set(sorted);
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(present.has(dayKey(d)));
  }
  return out;
}
