import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, BackButton, SectionHeader } from '../../components/ui';
import { FadeIn } from '../../components/motion';
import Garden from '../../components/Garden';
import QuestsCard from '../../components/QuestsCard';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { useCalm } from '../../store/calm';
import { localizeDigits } from '../../utils/format';
import { gardenFor, SKIES, skiesUnlocked } from '../../utils/calmData';
import { tap as hapticTap } from '../../utils/haptics';

// The Calm Corner: the part of Kalimni that is allowed to be enjoyable.
//
// Everything here is optional, short, and impossible to fail. That constraint
// is not decoration — it is what separates a mental-health app from a habit
// tracker. A habit tracker's leverage is the fear of breaking a streak, and
// pointing that at a depressed person makes the app one more thing they are
// failing at. So: no streaks, no timers, no leaderboards, no comparison, and
// nothing that can be taken away once earned.
//
// Growth points come from everywhere the patient shows up — check-ins from the
// server, calm sessions and quests from the device — and only ever go up.

const ACTIVITIES = [
  { id: 'breathing', screen: 'Breathing', icon: 'ellipse-outline', tint: 'tintBlue' },
  { id: 'grounding', screen: 'Grounding', icon: 'footsteps-outline', tint: 'tintGreen' },
  { id: 'bubbles',   screen: 'Bubbles',   icon: 'water-outline',    tint: 'tintPurple' },
  { id: 'reframe',   screen: 'Reframe',   icon: 'repeat-outline',   tint: 'tintSand' },
];

export default function CalmScreen({ navigation }) {
  const { t, lang } = useI18n();
  const growth = useCalm((s) => s.growth);
  const questsCompleted = useCalm((s) => s.questsCompleted);
  const sky = useCalm((s) => s.sky);
  const setSky = useCalm((s) => s.setSky);

  const { data: checkinData } = useQuery({
    queryKey: ['checkins'],
    queryFn: () => api('/ai/checkins'),
  });

  const checkins = checkinData?.total ?? (checkinData?.entries || []).length;
  const points = checkins + growth;
  const { plants, tier, toNextTier, complete } = gardenFor(points);
  const unlocked = skiesUnlocked(questsCompleted);
  const n = (v) => localizeDigits(v, lang);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 20 }} showsVerticalScrollIndicator={false}>
        <FadeIn index={0}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BackButton onPress={() => navigation.goBack()} />
            <View style={{ flex: 1, gap: 2 }}>
              <T w="700" size={22}>{t('calm.title')}</T>
              <T size={13} color={colors.muted}>{t('calm.subtitle')}</T>
            </View>
          </View>
        </FadeIn>

        {/* The garden */}
        <FadeIn index={1} style={{ gap: 12 }}>
          <Garden points={points} skyId={sky} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <T w="700" size={15}>{t(`calm.tier.${tier}`)}</T>
              <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>
                {complete
                  ? t('calm.gardenComplete', { n: n(points) })
                  : t('calm.gardenBody', { n: n(points), next: n(toNextTier || 1) })}
              </T>
            </View>
            <View style={{ alignItems: 'center' }}>
              <T w="700" size={20} color={colors.primary}>{n(plants)}</T>
              <T size={11} color={colors.faint}>{t('calm.plants')}</T>
            </View>
          </View>
        </FadeIn>

        {/* Activities */}
        <FadeIn index={2} style={{ gap: 12 }}>
          <SectionHeader title={t('calm.activities')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {ACTIVITIES.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => { hapticTap(); navigation.navigate(a.screen); }}
                style={{ width: '47.5%', flexGrow: 1 }}
              >
                <View style={{ borderRadius: 18, backgroundColor: colors[a.tint][0], padding: 16, gap: 10 }}>
                  <View
                    style={{
                      width: 42, height: 42, borderRadius: 21, backgroundColor: colors[a.tint][1],
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={a.icon} size={20} color="#FFFFFF" />
                  </View>
                  <T w="700" size={14.5} color="#1F3A46">{t(`calm.act.${a.id}.title`)}</T>
                  <T size={11.5} color="#41606E" style={{ lineHeight: 18 }}>
                    {t(`calm.act.${a.id}.meta`)}
                  </T>
                </View>
              </Pressable>
            ))}
          </View>
        </FadeIn>

        {/* Daily quests */}
        <FadeIn index={3}>
          <QuestsCard />
        </FadeIn>

        {/* Collectible skies */}
        <FadeIn index={4} style={{ gap: 12 }}>
          <SectionHeader title={t('calm.skies')} />
          <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>
            {t('calm.skiesBody', { n: n(unlocked.length), total: n(SKIES.length) })}
          </T>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
          >
            {SKIES.map((s) => {
              const isUnlocked = s.at <= questsCompleted;
              const active = sky === s.id;
              return (
                <Pressable
                  key={s.id}
                  disabled={!isUnlocked}
                  onPress={() => { hapticTap(); setSky(s.id); }}
                  accessibilityLabel={t(`calm.sky.${s.id}`)}
                  accessibilityState={{ disabled: !isUnlocked, selected: active }}
                >
                  <View style={{ alignItems: 'center', gap: 6, width: 84 }}>
                    <LinearGradient
                      colors={isUnlocked ? s.colors : [colors.bgSoft, colors.track]}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={{
                        width: 78, height: 56, borderRadius: 14,
                        borderWidth: active ? 2.5 : 0, borderColor: colors.primary,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {!isUnlocked && <Ionicons name="lock-closed" size={17} color={colors.faint} />}
                    </LinearGradient>
                    <T size={11} w={active ? '600' : '400'} color={isUnlocked ? colors.muted : colors.faint}>
                      {isUnlocked ? t(`calm.sky.${s.id}`) : t('calm.skyLocked', { n: n(s.at) })}
                    </T>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </FadeIn>

        {/* The promise, written down. Patients read this kind of line and it
            changes how the rest of the screen feels. */}
        <FadeIn index={5}>
          <Card style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.success} />
            <T size={12.5} color={colors.muted} style={{ flex: 1, lineHeight: 21 }}>
              {t('calm.promise')}
            </T>
          </Card>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}
