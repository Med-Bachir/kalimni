import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './ui';
import { ProgressBar, CountUp } from './motion';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { localizeDigits } from '../utils/format';
import { journeyFor } from '../utils/milestones';

// The patient's check-in journey: current milestone, progress to the next, and
// a lifetime count that only ever goes up. No streak, no "don't lose it", no
// comparison to anyone else — see utils/milestones.js for why.

const BAR_HEIGHT = 8;

export default function JourneyCard({ total }) {
  const { t, lang } = useI18n();
  const journey = journeyFor(total);
  if (!journey) return null; // nothing logged yet — the trend card covers that

  const { reached, next, progress, remaining } = journey;
  const n = (v) => localizeDigits(v, lang);

  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={reached.icon} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T size={11.5} w="600" color={colors.faint}>{t('journey.title')}</T>
          <T w="700" size={15.5} style={{ lineHeight: 22 }}>
            {t(`journey.milestone.${reached.at}`)}
          </T>
        </View>
      </View>

      {next ? (
        <View style={{ gap: 8 }}>
          {/* Fill is a plain width % — RN flips row direction under RTL, so it
              grows from the correct edge in both languages. */}
          <ProgressBar
            progress={progress}
            height={BAR_HEIGHT}
            trackColor={colors.track}
            fillColor={colors.primary}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
              {t('journey.toNext', { n: n(remaining), name: t(`journey.milestone.${next.at}`) })}
            </T>
            <CountUp value={total} format={n} size={12.5} w="600" color={colors.muted} />
          </View>
        </View>
      ) : (
        <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>
          {t('journey.complete', { n: n(total) })}
        </T>
      )}
    </Card>
  );
}
