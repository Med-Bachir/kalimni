import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { T, Card } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { api } from '../api/client';
import { categoryIcon, GRADIENT_ICON_COLOR } from '../utils/contentVisual';

// One thing to come back for, different every day.
//
// Source is the existing rule-based recommender (questionnaire scores + recent
// check-ins + companion emotion — no LLM, no cost), so the pick is personal
// rather than random. Rotating by day-of-year over that ranked list keeps it
// stable for the whole day — the card must not reshuffle on every refetch or
// re-render, or "today's" loses all meaning — while still being new tomorrow.

const dayOfYear = (date = new Date()) =>
  Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);

export default function TodayCard() {
  const { t, L } = useI18n();
  const navigation = useNavigation();

  const { data } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api('/ai/recommendations'),
  });

  const items = data?.items || [];
  if (!items.length) return null;

  const item = items[dayOfYear() % items.length];
  const isExercise = item.type === 'exercise';

  return (
    <Card
      style={{ padding: 14, gap: 12 }}
      onPress={() => navigation.navigate('Article', { id: item.id })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="sunny-outline" size={17} color={colors.warn} />
        <T w="700" size={12.5} color={colors.warn}>{t('today.label')}</T>
      </View>

      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <LinearGradient
          colors={item.gradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 62, height: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={`${categoryIcon(item.category)}-outline`} size={24} color={GRADIENT_ICON_COLOR} />
        </LinearGradient>
        <View style={{ flex: 1, gap: 5 }}>
          <T w="700" size={15} style={{ lineHeight: 23 }}>{L(item.title)}</T>
          <T size={12} color={colors.muted}>
            {t('library.minRead', { n: item.minutes })} · {t(`library.categories.${item.category}`)}
          </T>
        </View>
      </View>

      <T w="600" size={13.5} color={colors.primary}>
        {t(isExercise ? 'today.tryIt' : 'today.readIt')}
      </T>
    </Card>
  );
}
