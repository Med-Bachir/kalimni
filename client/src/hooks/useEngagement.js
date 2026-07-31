import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useCalm } from '../store/calm';
import { useSpirit } from '../store/spirit';
import { dayKey, gardenFor, skiesUnlocked, SKIES, GARDEN_CAPACITY } from '../utils/calmData';
import { presenceFor } from '../utils/presence';
import { badgeContext, earnedBadges } from '../utils/badges';
import { levelFor, pointsFrom } from '../utils/levels';
import { milestone as soundMilestone } from '../utils/sound';
import { celebrate as hapticCelebrate } from '../utils/haptics';

// One place that knows how far along the patient is.
//
// Level, badges, garden and streak all read from the same three sources — the
// check-in feed on the server, the calm store on the device, and the spirit
// store — and they must never disagree. Two screens computing "points" slightly
// differently is how a level silently goes backwards between tabs.
//
// The check-in query shares the ['checkins'] key with HomeScreen, CalmScreen
// and DailyCheckin, so mounting this costs no extra request and saving a
// check-in updates every consumer at once.

const notesIn = (entries = []) =>
  entries.filter((e) => typeof e?.note === 'string' && e.note.trim()).length;

// Day keys for every server-side check-in we can see. Merged into the device
// presence log so an install that predates the engagement release — or a
// reinstall, where the device log is gone but the server history is not —
// shows a truthful week row instead of an empty one.
const checkinDays = (entries = []) =>
  entries
    .map((e) => {
      const date = new Date(e?.createdAt);
      return Number.isNaN(date.getTime()) ? null : dayKey(date);
    })
    .filter(Boolean);

export function useEngagement({ award = false } = {}) {
  const growth = useCalm((s) => s.growth);
  const questsCompleted = useCalm((s) => s.questsCompleted);
  const days = useCalm((s) => s.days);
  const activities = useCalm((s) => s.activities);
  const storedNotes = useCalm((s) => s.notes);
  const hardDays = useCalm((s) => s.hardDays);
  const badges = useCalm((s) => s.badges);
  const awardBadges = useCalm((s) => s.awardBadges);

  const spiritId = useSpirit((s) => s.id);
  const bond = useSpirit((s) => s.bond);

  const { data } = useQuery({
    queryKey: ['checkins'],
    queryFn: () => api('/ai/checkins'),
    staleTime: 5 * 60_000,
  });

  const entries = data?.entries;
  const checkins = data?.total ?? (entries || []).length;

  const value = useMemo(() => {
    const list = entries || [];

    // Device counter vs what the server can still see, whichever is higher.
    // Neither alone is complete: the device count starts at zero for existing
    // installs, and the server list is capped at 60 entries.
    const notes = Math.max(storedNotes, notesIn(list));

    const presence = presenceFor([...days, ...checkinDays(list)]);
    const points = checkins + growth;
    const garden = gardenFor(points);
    const sessions = Object.values(activities).reduce((sum, n) => sum + (Number(n) || 0), 0);

    const context = badgeContext({
      checkins,
      notes,
      activities,
      sessions,
      questsCompleted,
      plants: garden.plants,
      gardenCapacity: GARDEN_CAPACITY,
      skies: skiesUnlocked(questsCompleted).length,
      skyCount: SKIES.length,
      spiritMet: !!spiritId,
      bond,
      daysPresent: presence.daysPresent,
      bestRun: presence.best,
      returns: presence.returns,
      hardDays,
    });

    const earned = earnedBadges(context);

    return {
      checkins,
      notes,
      points,
      garden,
      presence,
      sessions,
      context,
      earned,
      level: levelFor(pointsFrom({ checkins, growth, notes })),
      // What the store has already acknowledged. The difference between this
      // and `earned` is what the celebration effect below fires on.
      known: badges,
    };
  }, [entries, checkins, growth, questsCompleted, days, activities, storedNotes, hardDays, badges, spiritId, bond]);

  // Only ONE mounted consumer should pass award:true, otherwise the same new
  // badge gets celebrated on every screen that happens to be alive. HomeScreen
  // owns it — it is the screen the patient lands on after doing anything.
  useEffect(() => {
    if (!award) return;
    const fresh = awardBadges(value.earned);
    if (fresh.length) {
      hapticCelebrate();
      soundMilestone();
    }
  }, [award, value.earned, awardBadges]);

  return value;
}
