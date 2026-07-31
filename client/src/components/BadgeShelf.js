import React from 'react';
import { View, ScrollView, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { localizeDigits } from '../utils/format';
import { BADGES, BADGE_COUNT, badgeById } from '../utils/badges';

// The badge shelf: what has been earned, never what has been missed.
//
// The compact shelf shows earned badges only. A row of grey silhouettes on the
// home screen would turn an achievement display into a list of things the
// patient has not done, which is the opposite of the point — the full grid on
// the badges screen is where locked ones live, because going there is a choice.

// One colour per group, so the shelf reads as variety rather than a wall of
// identical circles. Resolved at render time: `colors` is mutated in place by
// the theme switcher, so this cannot be a module-level constant.
const groupColor = (group) => ({
  presence: colors.primary,
  calm: colors.tintBlue[1],
  garden: colors.success,
  spirit: colors.purple,
  resilience: colors.warn,
}[group] || colors.primary);

export function BadgeIcon({ id, size = 52, locked = false }) {
  const badge = badgeById(id);
  if (!badge) return null;

  const tint = locked ? colors.faint : groupColor(badge.group);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: locked ? 'transparent' : `${tint}1F`,
        borderWidth: locked ? 1.5 : 0,
        borderColor: colors.border,
        // Locked badges are drawn at reduced opacity rather than replaced with
        // a padlock: the shape stays recognisable, so arriving at it later
        // feels like something appearing rather than something unlocking.
        opacity: locked ? 0.45 : 1,
      }}
    >
      <Ionicons name={badge.icon} size={size * 0.42} color={tint} />
    </View>
  );
}

export default function BadgeShelf({ earned = [], onPress, compact }) {
  const { t, lang } = useI18n();
  const n = (v) => localizeDigits(v, lang);

  // Catalogue order, so the shelf is stable — badges do not jump around as new
  // ones arrive.
  const shown = BADGES.filter((b) => earned.includes(b.id));

  return (
    <Card style={{ padding: 16, gap: 13 }} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="medal-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <T w="700" size={15.5}>{t('badges.title')}</T>
          {!compact && (
            <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>
              {t('badges.subtitle')}
            </T>
          )}
        </View>
        <T size={12.5} w="600" color={colors.faint}>
          {t('badges.count', { done: n(shown.length), total: n(BADGE_COUNT) })}
        </T>
      </View>

      {shown.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
        >
          {shown.map((b) => (
            <View key={b.id} style={{ alignItems: 'center', gap: 6, width: 66 }}>
              <BadgeIcon id={b.id} size={50} />
              <T size={10.5} w="600" color={colors.muted} style={{ textAlign: 'center', lineHeight: 15 }}>
                {t(`badges.items.${b.id}.name`)}
              </T>
            </View>
          ))}
        </ScrollView>
      ) : (
        <T size={12.5} color={colors.faint} style={{ lineHeight: 20 }}>
          {t('badges.empty')}
        </T>
      )}

      {onPress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <T w="600" size={13} color={colors.primary}>{t('badges.seeAll')}</T>
          <Ionicons
            name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
            size={14}
            color={colors.primary}
          />
        </View>
      )}
    </Card>
  );
}
