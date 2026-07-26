// Journey milestones for the daily check-in.
//
// Accumulation only: the count never resets and never decreases, so a missed
// day costs nothing. This is the deliberate alternative to streaks — a broken
// streak punishes exactly the week someone most needs to come back, and once
// it's broken the reason to return is gone with it.
//
// Growth imagery rather than medals or trophies: the app is meant to feel like
// a companion, not a competition. There is no leaderboard and no comparison
// between patients anywhere in this ladder, by design.

export const MILESTONES = [
  { at: 1, icon: 'sparkles-outline' },
  { at: 3, icon: 'leaf-outline' },
  { at: 7, icon: 'flower-outline' },
  { at: 14, icon: 'sunny-outline' },
  { at: 30, icon: 'heart-outline' },
  { at: 60, icon: 'star-outline' },
  { at: 100, icon: 'ribbon-outline' },
  { at: 180, icon: 'planet-outline' },
  { at: 365, icon: 'infinite-outline' },
];

/**
 * Where a patient stands on the ladder.
 *
 * Returns null below the first milestone so callers can render nothing rather
 * than an empty progress bar. Past the last one, `next` is null and progress
 * is complete — the ladder ends, the check-ins don't.
 */
export function journeyFor(total) {
  if (!Number.isFinite(total) || total < 1) return null;

  let reached = null;
  let next = null;
  for (const milestone of MILESTONES) {
    if (milestone.at <= total) reached = milestone;
    else {
      next = milestone;
      break;
    }
  }

  const from = reached ? reached.at : 0;
  return {
    total,
    reached,
    next,
    progress: next ? (total - from) / (next.at - from) : 1,
    remaining: next ? next.at - total : 0,
  };
}

// True exactly on a milestone — the moment worth celebrating, checked against
// the post-insert total the check-in endpoint returns.
export const isMilestone = (total) => MILESTONES.some((m) => m.at === total);
