import React, { useState } from 'react';
import { View, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card, Chip } from './ui';
import { GrowBars } from './motion';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { localizeDigits } from '../utils/format';

// The daily check-in given back to the patient. Drawn with plain Views like
// ScoreTrendChart — no chart lib, no native deps.
//
// Days with no entry render as an empty track slot instead of being skipped:
// the axis stays a real calendar (so a gap is visible) but nothing about it is
// styled as a failure. Deliberately no streaks — a broken one would punish
// exactly the week a patient most needs to come back.

const SCALE_MAX = 5;
const RIBBON_HEIGHT = 42;
const CHART_HEIGHT = 110;
const RANGE_DAYS = 14; // two weeks: the chart plus its own comparison window

// Everything but stress reads "higher is better"; `normalize` flips stress so
// 5 always means good, which lets one colour scale and one delta serve all
// four metrics.
const METRICS = [
  { key: 'mood', higherIsBetter: true },
  { key: 'stress', higherIsBetter: false },
  { key: 'energy', higherIsBetter: true },
  { key: 'sleep', higherIsBetter: true },
];

const normalize = (value, higherIsBetter) => (higherIsBetter ? value : SCALE_MAX + 1 - value);

// A 3 stays neutral primary rather than amber — an average day is not a warning.
function bandColor(value, higherIsBetter) {
  const v = normalize(value, higherIsBetter);
  if (v >= 4) return colors.success;
  if (v >= 3) return colors.primary;
  if (v >= 2) return colors.warn;
  return colors.dangerDark;
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const weekdayNarrow = (date, lang) =>
  date.toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-FR', { weekday: 'narrow' });

/**
 * The last `days` calendar days, oldest -> newest, each carrying that day's
 * newest entry (or null). Fixed width keeps the axis a calendar, so a second
 * check-in on one day can't shift it.
 */
export function dailySeries(entries = [], days) {
  const byDay = new Map();
  for (const entry of entries) {
    const key = dayKey(new Date(entry.createdAt));
    const kept = byDay.get(key);
    // ISO timestamps compare chronologically, so this holds whatever order the
    // caller passes.
    if (!kept || entry.createdAt > kept.createdAt) byDay.set(key, entry);
  }

  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - i));
    return { date, entry: byDay.get(dayKey(date)) || null };
  });
}

/**
 * Compact seven-day mood strip for the home screen. Renders nothing until the
 * patient has checked in at least once — an empty chart is a chore, not a
 * reward.
 */
export function MoodRibbon({ entries, onPress }) {
  const { t, lang } = useI18n();
  const series = dailySeries(entries, 7);
  const logged = series.filter((d) => d.entry).length;
  if (logged === 0) return null;

  return (
    <Card onPress={onPress} style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="analytics-outline" size={20} color={colors.primary} />
        <T w="700" size={16} style={{ flex: 1 }}>{t('trend.weekTitle')}</T>
        <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.faint} />
      </View>

      <GrowBars
        bars={series.map(({ date, entry }) => ({
          key: dayKey(date),
          date,
          height: entry ? Math.max(9, Math.round((entry.mood / SCALE_MAX) * RIBBON_HEIGHT)) : 0,
          color: entry ? bandColor(entry.mood, true) : 'transparent',
        }))}
        trackHeight={RIBBON_HEIGHT}
        radius={8}
        gap={7}
        trackColor={colors.track}
        labelFor={(bar) => <T size={10} color={colors.faint}>{weekdayNarrow(bar.date, lang)}</T>}
      />

      <T size={12.5} color={colors.muted}>
        {t('trend.loggedDays', { n: localizeDigits(logged, lang), total: localizeDigits(7, lang) })}
      </T>
    </Card>
  );
}

/**
 * Full two-week chart with a metric switcher.
 *
 * `audience` swaps the copy: the patient's version nudges them to raise a hard
 * week with their specialist, which reads wrong when the specialist is the one
 * looking at it. `title` lets the caller name the card for whoever is reading.
 */
export default function MoodTrend({ entries, title, audience = 'patient' }) {
  const { t, lang } = useI18n();
  const [metricKey, setMetricKey] = useState('mood');
  const metric = METRICS.find((m) => m.key === metricKey);

  const series = dailySeries(entries, RANGE_DAYS);
  const logged = series.filter((d) => d.entry);
  if (logged.length === 0) return null;

  const average = logged.reduce((sum, d) => sum + d.entry[metricKey], 0) / logged.length;

  // Second week against the first, on the normalized scale so "up" means
  // better whichever metric is showing. Both weeks need an entry to compare.
  const half = RANGE_DAYS / 2;
  const avgOf = (slice) => {
    const values = slice
      .filter((d) => d.entry)
      .map((d) => normalize(d.entry[metricKey], metric.higherIsBetter));
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  };
  const earlier = avgOf(series.slice(0, half));
  const recent = avgOf(series.slice(half));
  // 0.5 of a scale point — below that a shift is noise on a 1-5 tap scale.
  const delta = earlier !== null && recent !== null ? recent - earlier : null;
  const trend =
    delta === null ? null
    : delta >= 0.5 ? { icon: 'trending-up', color: colors.success, text: t('trend.better') }
    : delta <= -0.5 ? {
        icon: 'trending-down',
        color: colors.dangerDark,
        text: t(audience === 'specialist' ? 'trend.worseNeutral' : 'trend.worse'),
      }
    : { icon: 'remove', color: colors.muted, text: t('trend.same') };

  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T w="700" size={15}>{title || t('trend.title')}</T>
        <T size={12} color={colors.muted}>
          {t('trend.average', {
            value: localizeDigits(average.toFixed(1), lang),
            max: localizeDigits(SCALE_MAX, lang),
          })}
        </T>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {METRICS.map((m) => (
          <Chip
            key={m.key}
            label={t(`trend.metric.${m.key}`)}
            active={m.key === metricKey}
            onPress={() => setMetricKey(m.key)}
          />
        ))}
      </View>

      <GrowBars
        bars={series.map(({ date, entry }) => ({
          key: dayKey(date),
          date,
          height: entry
            ? Math.max(8, Math.round((entry[metricKey] / SCALE_MAX) * CHART_HEIGHT))
            : 0,
          color: entry ? bandColor(entry[metricKey], metric.higherIsBetter) : 'transparent',
        }))}
        trackHeight={CHART_HEIGHT}
        radius={6}
        gap={4}
        trackColor={colors.track}
        labelFor={(bar) => <T size={9.5} color={colors.faint}>{weekdayNarrow(bar.date, lang)}</T>}
      />

      {trend && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name={trend.icon} size={15} color={trend.color} />
          <T size={12.5} color={trend.color} style={{ flex: 1, lineHeight: 20 }}>{trend.text}</T>
        </View>
      )}
    </Card>
  );
}
