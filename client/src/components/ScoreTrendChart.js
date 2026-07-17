import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './ui';
import { colors, severityColors } from '../theme/colors';
import { useI18n } from '../i18n';
import { localizeDigits } from '../utils/format';

// Score trend for one questionnaire, drawn with plain Views (no chart lib, no
// native deps). Bars are colored by severity band; lower is better on both
// GAD-7 and PHQ-9, so the delta footer treats a drop as improvement.
const CHART_HEIGHT = 110;
const MAX_POINTS = 8;

export default function ScoreTrendChart({ code, results, maxScore }) {
  const { t, lang } = useI18n();
  if (!results || results.length === 0) return null;

  // Oldest -> newest, capped to the last MAX_POINTS attempts.
  const points = [...results]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-MAX_POINTS);
  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;

  const shortDate = (iso) =>
    localizeDigits(
      new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-FR', { day: 'numeric', month: 'short' }),
      lang
    );

  const delta = previous ? previous.score - latest.score : null; // >0 = improved
  const trend =
    delta === null ? null
    : delta > 0 ? { icon: 'trending-down', color: colors.success, text: t('history.improved', { n: localizeDigits(delta, lang) }) }
    : delta < 0 ? { icon: 'trending-up', color: colors.dangerDark, text: t('history.worsened', { n: localizeDigits(-delta, lang) }) }
    : { icon: 'remove', color: colors.muted, text: t('history.stable') };

  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T w="700" size={15}>{code}</T>
        <T size={12} color={colors.muted}>
          {t('history.latest')}: {localizeDigits(latest.score, lang)}/{localizeDigits(maxScore, lang)}
        </T>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: CHART_HEIGHT + 38 }}>
        {points.map((p) => {
          const { fg } = severityColors(p.level);
          const barHeight = Math.max(6, Math.round((p.score / maxScore) * CHART_HEIGHT));
          return (
            <View key={p.id} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              <T size={11} w="600" color={fg}>{localizeDigits(p.score, lang)}</T>
              <View style={{ width: '100%', maxWidth: 34, height: barHeight, borderRadius: 7, backgroundColor: fg, opacity: 0.85 }} />
              <T size={10} color={colors.faint} numberOfLines={1}>{shortDate(p.createdAt)}</T>
            </View>
          );
        })}
      </View>

      {trend ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name={trend.icon} size={15} color={trend.color} />
          <T size={12.5} color={trend.color} style={{ flex: 1 }}>{trend.text}</T>
        </View>
      ) : (
        <T size={12.5} color={colors.muted}>{t('history.onceOnly')}</T>
      )}
    </Card>
  );
}
