import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './ui';
import { ProgressBar, CountUp } from './motion';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { localizeDigits } from '../utils/format';

// Wellness level and the week behind it, in one card.
//
// THE WEEK ROW IS THE STREAK, and how it is drawn is the entire argument. Seven
// dots, oldest to newest, filled for days the patient showed up. Four filled
// and three empty is a good week that reads as a good week — whereas "streak: 0"
// would describe the same seven days as a failure.
//
// The number that gets the emphasis is `best`, the longest run ever reached,
// because it cannot fall. The current run is shown quietly beside it and is
// never labelled as lost, broken or reset. If the current run is zero the app
// simply says nothing about it.

const DOT = 13;

function WeekRow({ week, lang }) {
  const { t } = useI18n();
  return (
    <View
      style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}
      accessibilityRole="image"
      accessibilityLabel={t('level.weekA11y', {
        n: localizeDigits(week.filter(Boolean).length, lang),
      })}
    >
      {week.map((present, i) => (
        <View
          key={i}
          style={{
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            backgroundColor: present ? colors.primary : 'transparent',
            borderWidth: present ? 0 : 1.5,
            borderColor: colors.track,
          }}
        />
      ))}
    </View>
  );
}

export default function LevelCard({ level, presence, onPress }) {
  const { t, lang } = useI18n();
  if (!level) return null;

  const n = (v) => localizeDigits(v, lang);
  const { best = 0, current = 0, week = [], daysPresent = 0 } = presence || {};

  return (
    <Card style={{ padding: 16, gap: 14 }} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 46, height: 46, borderRadius: 23, backgroundColor: colors.bgSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={level.icon} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T size={11.5} w="600" color={colors.faint}>
            {t('level.label', { n: n(level.level) })}
          </T>
          <T w="700" size={15.5} style={{ lineHeight: 22 }}>
            {t(`level.name.${level.level}`)}
          </T>
        </View>
        <CountUp value={level.total} format={n} size={19} w="700" color={colors.primary} />
      </View>

      {level.next ? (
        <View style={{ gap: 8 }}>
          <ProgressBar
            progress={level.progress}
            height={8}
            trackColor={colors.track}
            fillColor={colors.primary}
          />
          <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>
            {t('level.toNext', { n: n(level.remaining), name: t(`level.name.${level.next.level}`) })}
          </T>
        </View>
      ) : (
        <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>
          {t('level.max', { n: n(level.total) })}
        </T>
      )}

      <View style={{ height: 1, backgroundColor: colors.divider }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ gap: 7, flex: 1 }}>
          <T size={11.5} w="600" color={colors.faint}>{t('level.thisWeek')}</T>
          <WeekRow week={week} lang={lang} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          {/* Best run leads. It is the number that can only ever grow. */}
          <T w="700" size={15} color={colors.ink}>
            {t('level.bestRun', { n: n(best) })}
          </T>
          <T size={11.5} color={colors.faint}>
            {current > 1
              ? t('level.currentRun', { n: n(current) })
              : t('level.daysPresent', { n: n(daysPresent) })}
          </T>
        </View>
      </View>
    </Card>
  );
}
