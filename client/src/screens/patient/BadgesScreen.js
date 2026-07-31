import React from 'react';
import { View, ScrollView } from 'react-native';
import { Screen, T, Card, BackButton, SectionHeader } from '../../components/ui';
import { FadeIn } from '../../components/motion';
import { BadgeIcon } from '../../components/BadgeShelf';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { localizeDigits } from '../../utils/format';
import { BADGES, BADGE_GROUPS, BADGE_COUNT } from '../../utils/badges';
import { useEngagement } from '../../hooks/useEngagement';

// The full collection, grouped.
//
// Locked badges ARE shown here, unlike the shelf on the home screen — arriving
// on this screen is a deliberate act, and once you are here "what else is
// there" is a fair question. What is never shown is progress toward a locked
// badge: no "3 / 10 fed", no percentage. A half-filled bar on something you
// have not done reads as a debt, and this app does not keep those.

export default function BadgesScreen({ navigation }) {
  const { t, lang } = useI18n();
  const { earned } = useEngagement();
  const n = (v) => localizeDigits(v, lang);

  const has = (id) => earned.includes(id);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 20 }} showsVerticalScrollIndicator={false}>
        <FadeIn index={0}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BackButton onPress={() => navigation.goBack()} />
            <View style={{ flex: 1, gap: 2 }}>
              <T w="700" size={22}>{t('badges.title')}</T>
              <T size={13} color={colors.muted}>
                {t('badges.count', { done: n(earned.length), total: n(BADGE_COUNT) })}
              </T>
            </View>
          </View>
        </FadeIn>

        <FadeIn index={1}>
          <Card style={{ padding: 16 }}>
            <T size={12.5} color={colors.muted} style={{ lineHeight: 21 }}>
              {t('badges.promise')}
            </T>
          </Card>
        </FadeIn>

        {BADGE_GROUPS.map((group, gi) => {
          const items = BADGES.filter((b) => b.group === group);
          if (!items.length) return null;

          return (
            <FadeIn key={group} index={2 + gi} style={{ gap: 12 }}>
              <SectionHeader title={t(`badges.groups.${group}`)} />
              <View style={{ gap: 10 }}>
                {items.map((b) => {
                  const unlocked = has(b.id);
                  return (
                    <Card
                      key={b.id}
                      style={{
                        padding: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        backgroundColor: unlocked ? colors.card : colors.bgSoft,
                        borderColor: unlocked ? colors.border : colors.bgSoft,
                      }}
                    >
                      <BadgeIcon id={b.id} size={48} locked={!unlocked} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <T
                          w="700"
                          size={14.5}
                          color={unlocked ? colors.ink : colors.muted}
                          style={{ lineHeight: 21 }}
                        >
                          {t(`badges.items.${b.id}.name`)}
                        </T>
                        <T size={12.5} color={unlocked ? colors.muted : colors.faint} style={{ lineHeight: 20 }}>
                          {t(`badges.items.${b.id}.body`)}
                        </T>
                      </View>
                    </Card>
                  );
                })}
              </View>
            </FadeIn>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
