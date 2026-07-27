import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Avatar, Card, SectionHeader } from '../../components/ui';
import AppointmentCard from '../../components/AppointmentCard';
import DailyCheckin from '../../components/DailyCheckin';
import { MoodRibbon } from '../../components/MoodTrend';
import { checkinDue } from './HistoryScreen';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';
import { api } from '../../api/client';
import { categoryIcon, GRADIENT_ICON_COLOR } from '../../utils/contentVisual';

export default function HomeScreen({ navigation }) {
  const { t, L } = useI18n();
  const user = useAuth((s) => s.user);

  const { data: specialistData } = useQuery({
    queryKey: ['mySpecialist'],
    queryFn: () => api('/users/me/specialist'),
  });
  const { data: contentData } = useQuery({
    queryKey: ['content'],
    queryFn: () => api('/content'),
  });
  // Biweekly re-check nudge (measurement-based care): only relevant once the
  // intake questionnaire has been completed at least once.
  const { data: historyData } = useQuery({
    queryKey: ['history'],
    queryFn: () => api('/questionnaires/history'),
    enabled: !!user.intakeCompletedAt,
  });
  const { data: apptData } = useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: () => api('/appointments?scope=upcoming'),
  });
  // Same query key as DailyCheckin — one request feeds the form and the trend,
  // so saving today's entry refreshes the ribbon under it.
  const { data: checkinData } = useQuery({
    queryKey: ['checkins'],
    queryFn: () => api('/ai/checkins'),
  });
  // Open loop from the last companion conversation. The server decides whether
  // there is anything safe to say — the client only renders what it gets.
  const { data: followUpData } = useQuery({
    queryKey: ['aiFollowUp'],
    queryFn: () => api('/ai/followup'),
  });

  const specialist = specialistData?.specialist;
  const nextAppointment = (apptData?.appointments || [])[0];
  const articles = (contentData?.items || []).filter((i) => i.type === 'article').slice(0, 3);
  const journaling = (contentData?.items || []).find((i) => i.key === 'journaling');
  const greetingKey = new Date().getHours() < 12 ? 'home.greetingMorning' : 'home.greetingEvening';
  const needsIntake = !user.intakeCompletedAt && user.intakeSkipped;
  const showCheckin = checkinDue(historyData?.results);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 20 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <T size={14} color={colors.muted}>{t(greetingKey)}</T>
            <T w="700" size={22}>{user.name}</T>
          </View>
          <Avatar name={user.name} />
        </View>

        {/* Specialist CTA / matching state */}
        {specialist ? (
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <T w="700" size={17} color="#fff">{t('home.talkToSpecialist')}</T>
              <T size={13} color="rgba(255,255,255,.75)" style={{ lineHeight: 21 }}>
                {t(specialist.online ? 'home.availableNow' : 'home.offlineNow', { name: specialist.name })}
              </T>
              <TouchableOpacity
                onPress={() => navigation.navigate('ChatTab')}
                style={{
                  marginTop: 6, height: 38, minWidth: 130, alignSelf: 'flex-start', borderRadius: 11,
                  backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
                }}
              >
                <T w="600" size={14} color={colors.primaryDark}>{t('home.startChat')}</T>
              </TouchableOpacity>
            </View>
            <Avatar name={specialist.name} size={64} color={['rgba(255,255,255,.16)', '#fff']} online={specialist.online} />
          </LinearGradient>
        ) : needsIntake ? (
          <Card style={{ padding: 18, gap: 8 }} onPress={() => navigation.navigate('Disclaimer')}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="clipboard-outline" size={22} color={colors.primary} />
              <T w="700" size={16}>{t('home.completeIntakeTitle')}</T>
            </View>
            <T size={13.5} color={colors.muted} style={{ lineHeight: 22 }}>{t('home.completeIntakeBody')}</T>
            <T w="600" size={14} color={colors.primary}>{t('home.startIntake')}</T>
          </Card>
        ) : (
          <Card style={{ padding: 18, gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="time-outline" size={22} color={colors.warn} />
              <T w="700" size={16}>{t('home.noSpecialistTitle')}</T>
            </View>
            <T size={13.5} color={colors.muted} style={{ lineHeight: 22 }}>{t('home.noSpecialistBody')}</T>
          </Card>
        )}

        {/* Upcoming session */}
        {nextAppointment && (
          <View style={{ gap: 10 }}>
            <T w="700" size={17}>{t('appointments.upcoming')}</T>
            <AppointmentCard appointment={nextAppointment} partnerName={specialist?.name} />
          </View>
        )}

        {/* "Last time you mentioned..." — the companion remembering out loud. */}
        {followUpData?.followUp && (
          <Card style={{ padding: 18, gap: 8 }} onPress={() => navigation.navigate('Companion')}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.purple} />
              <T w="700" size={16}>{t('companion.followUpTitle')}</T>
            </View>
            <T size={14} color={colors.body} style={{ lineHeight: 23 }}>
              {followUpData.followUp}
            </T>
            <T w="600" size={14} color={colors.primary}>{t('companion.followUpCta')}</T>
          </Card>
        )}

        {/* Daily mood check-in (hides itself once today's entry exists), then
            the week it feeds — so what the patient gave comes straight back. */}
        <DailyCheckin />
        <MoodRibbon
          entries={checkinData?.entries}
          onPress={() => navigation.navigate('History')}
        />

        {/* Biweekly progress check-in */}
        {showCheckin && (
          <Card style={{ padding: 18, gap: 8 }} onPress={() => navigation.navigate('History')}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="pulse-outline" size={22} color={colors.primary} />
              <T w="700" size={16}>{t('home.checkinTitle')}</T>
            </View>
            <T size={13.5} color={colors.muted} style={{ lineHeight: 22 }}>{t('home.checkinBody')}</T>
            <T w="600" size={14} color={colors.primary}>{t('home.checkinAction')}</T>
          </Card>
        )}

        {/* Quick exercises */}
        <View style={{ gap: 12 }}>
          <SectionHeader
            title={t('home.shortExercises')} actionLabel={t('common.viewAll')}
            onAction={() => navigation.navigate('Library')}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Breathing')}
              style={{ flex: 1, borderRadius: 18, backgroundColor: '#E3EFF4', padding: 16, gap: 10 }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.85)' }} />
              </View>
              <T w="700" size={15}>{t('home.breathingTitle')}</T>
              <T size={12.5} color={colors.muted}>{t('home.breathingMeta')}</T>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => journaling && navigation.navigate('Article', { id: journaling.id })}
              style={{ flex: 1, borderRadius: 18, backgroundColor: colors.tintPurple[0], padding: 16, gap: 10 }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 22, backgroundColor: colors.purple,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="pencil" size={20} color="#fff" />
              </View>
              <T w="700" size={15}>{t('home.journalingTitle')}</T>
              <T size={12.5} color={colors.muted}>{t('home.journalingMeta')}</T>
            </TouchableOpacity>
          </View>
        </View>

        {/* Articles */}
        <View style={{ gap: 12 }}>
          <SectionHeader
            title={t('home.guidanceArticles')} actionLabel={t('common.viewAll')}
            onAction={() => navigation.navigate('Library')}
          />
          <View style={{ gap: 10 }}>
            {articles.map((item) => (
              <Card
                key={item.id}
                onPress={() => navigation.navigate('Article', { id: item.id })}
                style={{ padding: 12, flexDirection: 'row', gap: 14, alignItems: 'center' }}
              >
                <LinearGradient
                  colors={item.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={`${categoryIcon(item.category)}-outline`} size={24} color={GRADIENT_ICON_COLOR} />
                </LinearGradient>
                <View style={{ flex: 1, gap: 5 }}>
                  <T w="600" size={14.5} style={{ lineHeight: 22 }}>{L(item.title)}</T>
                  <T size={12} color={colors.muted}>
                    {t('library.minRead', { n: item.minutes })} · {t(`library.categories.${item.category}`)}
                  </T>
                </View>
              </Card>
            ))}
          </View>
        </View>

        {/* Crisis shortcut */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Crisis')}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.dangerBorder,
            backgroundColor: colors.card,
          }}
        >
          <Ionicons name="call-outline" size={17} color={colors.dangerDark} />
          <T w="600" size={13.5} color={colors.dangerDark}>{t('home.crisisBanner')}</T>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}
