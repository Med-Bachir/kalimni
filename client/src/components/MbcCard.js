import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { formatDate, localizeDigits } from '../utils/format';

// Measurement-based care summary — SPECIALIST SCREENS ONLY (Phase 2.2).
// Never render this anywhere a patient can reach: the moment better numbers
// become something to achieve, the questionnaires stop being the honest
// clinical instrument the treatment depends on.

const CODES = { gad7: 'GAD-7', phq9: 'PHQ-9' };

const DIRECTION = {
  improved: { icon: 'trending-down', color: colors.success },
  deteriorated: { icon: 'trending-up', color: colors.dangerDark },
  unchanged: { icon: 'remove', color: colors.muted },
};

// A change is only reported when it clears the instrument's measurement
// error; "unchanged" here means "within noise", not "identical".
function ChangeRow({ label, change, lang, t }) {
  if (!change) return null;
  const meta = DIRECTION[change.direction];
  const points = localizeDigits(Math.abs(change.delta), lang);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={meta.icon} size={15} color={meta.color} />
      <T size={12.5} color={colors.muted} style={{ flex: 1 }}>{label}</T>
      <T w="600" size={13} color={meta.color}>
        {change.direction === 'unchanged'
          ? t('mbc.withinNoise')
          : t(change.direction === 'improved' ? 'mbc.pointsDown' : 'mbc.pointsUp', { n: points })}
      </T>
    </View>
  );
}

export default function MbcCard({ data }) {
  const { t, lang } = useI18n();
  const trajectories = data?.trajectories || [];
  if (!trajectories.length) return null;

  const n = (v) => localizeDigits(v, lang);
  const selfHarm = data.selfHarmSeries || [];
  const latestSelfHarm = selfHarm.at(-1);
  const previousSelfHarm = selfHarm.length > 1 ? selfHarm.at(-2) : null;
  const selfHarmRose = previousSelfHarm && latestSelfHarm.value > previousSelfHarm.value;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T w="700" size={17} style={{ flex: 1 }}>{t('mbc.title')}</T>
        <T size={11} color={colors.faint}>{t('mbc.clinicianOnly')}</T>
      </View>

      {/* Item 9 first: it is the line clinicians scan for. */}
      {latestSelfHarm && (
        <Card style={{
          padding: 14, gap: 6,
          borderColor: latestSelfHarm.value > 0 ? colors.dangerBorder : colors.border,
          backgroundColor: latestSelfHarm.value > 0 ? '#FFF9F8' : colors.card,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons
              name={latestSelfHarm.value > 0 ? 'alert-circle' : 'checkmark-circle-outline'}
              size={17}
              color={latestSelfHarm.value > 0 ? colors.dangerDark : colors.success}
            />
            <T w="700" size={13.5} color={latestSelfHarm.value > 0 ? colors.dangerDark : colors.ink} style={{ flex: 1 }}>
              {t('mbc.selfHarmItem')}
            </T>
            <T w="700" size={15} color={latestSelfHarm.value > 0 ? colors.dangerDark : colors.muted}>
              {n(latestSelfHarm.value)}/{n(3)}
            </T>
          </View>
          {previousSelfHarm && (
            <T size={12} color={selfHarmRose ? colors.dangerDark : colors.muted}>
              {t(selfHarmRose ? 'mbc.selfHarmRose' : 'mbc.selfHarmPrevious', {
                from: n(previousSelfHarm.value), to: n(latestSelfHarm.value),
              })}
            </T>
          )}
        </Card>
      )}

      {trajectories.map((tr) => (
        <Card key={tr.questionnaireId} style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T w="700" size={14.5} style={{ flex: 1 }}>{CODES[tr.questionnaireId] || tr.questionnaireId}</T>
            <T size={12} color={colors.muted}>
              {t('mbc.administrations', { n: n(tr.administrations) })}
            </T>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T size={12.5} color={colors.muted}>{t('mbc.baseline')} {n(tr.baseline.score)}</T>
            <Ionicons name="arrow-forward" size={12} color={colors.faint} />
            <T w="700" size={20}>{n(tr.latest.score)}</T>
            <T size={11.5} color={colors.faint} style={{ marginStart: 'auto' }}>
              {formatDate(tr.latest.at, lang)}
            </T>
          </View>

          <ChangeRow label={t('mbc.sinceLast')} change={tr.sinceLast} lang={lang} t={t} />
          <ChangeRow label={t('mbc.sinceBaseline')} change={tr.sinceBaseline} lang={lang} t={t} />

          {tr.sinceBaseline?.clinicallySignificant && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name="ribbon-outline" size={15} color={colors.success} />
              <T w="600" size={12.5} color={colors.success}>{t('mbc.recovered')}</T>
            </View>
          )}

          {tr.nonResponse && (
            <View style={{
              flexDirection: 'row', gap: 8, backgroundColor: colors.warnBg,
              borderRadius: 10, padding: 10,
            }}>
              <Ionicons name="flag-outline" size={15} color={colors.warn} />
              <T size={12} color={colors.warn} style={{ flex: 1, lineHeight: 18 }}>
                {t('mbc.nonResponse', { weeks: n(Math.round(tr.weeksInTreatment)) })}
              </T>
            </View>
          )}

          <T size={11} color={colors.faint} style={{ lineHeight: 16 }}>
            {t('mbc.rciFootnote', { n: n(tr.reliableChangeThreshold) })}
          </T>
        </Card>
      ))}
    </View>
  );
}
