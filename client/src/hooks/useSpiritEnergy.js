import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

// The patient's most recent self-reported mood, 1..5, for the spirit animal to
// match. Null when they have never checked in.
//
// Shares the ['checkins'] query key with DailyCheckin and CalmScreen, so this
// costs no extra request — it reads a cache those screens already fill.
//
// WHAT THE ANIMAL DOES WITH IT is the part that needed thinking about, and the
// rule is: **match, never mourn.**
//
// On a low day the animal gets slower, quieter and stiller — a longer breath, a
// lazier blink, less wandering. It does NOT get sad. No drooping ears, no
// downturned mouth, no grey palette, and above all no reaction that could be
// read as disappointment. Someone who reports a storm day and watches their
// companion visibly deflate has just been told they are a burden to the one
// thing in the app that was supposed to be uncomplicated.
//
// Matching is the therapeutic half of this: attunement first — meet the state
// someone is actually in rather than the one you would prefer — and only then
// lead. It is the same move BreathingScreen makes by pacing slightly slower
// than a resting breath, and the same reason SpiritAnimal's idle breath is
// already slower than yours.
export function useSpiritEnergy(enabled = true) {
  const { data } = useQuery({
    queryKey: ['checkins'],
    queryFn: () => api('/ai/checkins'),
    enabled,
    staleTime: 5 * 60_000,
  });

  const mood = Number(data?.entries?.[0]?.mood);
  return Number.isFinite(mood) && mood >= 1 && mood <= 5 ? mood : null;
}
