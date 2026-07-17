import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, I18nManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, Chip, Badge, LoadingView, ErrorView, EmptyState } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { categoryIcon, GRADIENT_ICON_COLOR } from '../../utils/contentVisual';

const CATEGORIES = ['all', 'anxiety', 'sleep', 'growth', 'exercises'];

export default function LibraryScreen({ navigation }) {
  const { t, L } = useI18n();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['content'],
    queryFn: () => api('/content'),
  });

  // Personalized picks (questionnaires + check-ins + companion state). Soft
  // dependency: if the endpoint fails the library just renders without it.
  const { data: recData } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api('/ai/recommendations'),
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const needle = search.trim().toLowerCase();
  let items = data.items.filter((i) => category === 'all' || i.category === category);
  if (needle) {
    items = items.filter(
      (i) =>
        L(i.title).toLowerCase().includes(needle) || L(i.summary).toLowerCase().includes(needle)
    );
  }
  const featured = !needle && category === 'all' ? items.find((i) => i.featured) : null;
  const rest = items.filter((i) => i !== featured);

  const open = (item) => {
    if (item.type === 'exercise' && item.exerciseKey === 'breathing478') {
      navigation.navigate('Breathing');
    } else {
      navigation.navigate('Article', { id: item.id });
    }
  };

  const metaOf = (item) =>
    item.type === 'audio'
      ? t('library.minAudio', { n: item.minutes })
      : item.type === 'exercise'
        ? t('library.minExercise', { n: item.minutes })
        : `${t('library.minRead', { n: item.minutes })} · ${t(`library.categories.${item.category}`)}`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} showsVerticalScrollIndicator={false}>
        <T w="700" size={22}>{t('library.title')}</T>

        {/* Search */}
        <View style={{
          height: 50, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1.5,
          borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
        }}>
          <Ionicons name="search" size={20} color={colors.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('library.searchPlaceholder')}
            placeholderTextColor={colors.faint}
            style={{
              flex: 1, fontSize: 14.5, color: colors.ink,
              fontFamily: 'IBMPlexSansArabic_400Regular',
              textAlign: I18nManager.isRTL ? 'right' : 'left',
            }}
          />
        </View>

        {/* Categories */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`library.categories.${c}`)} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        {/* Recommended for you — case-based picks, unfiltered view only */}
        {!needle && category === 'all' && (recData?.items || []).length > 0 && (
          <View style={{ gap: 10 }}>
            <T w="700" size={17}>{t('library.recommended')}</T>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingEnd: 4 }}
            >
              {recData.items.map((item) => (
                <Card key={`rec-${item.id}`} onPress={() => open(item)} style={{ width: 200, overflow: 'hidden', borderRadius: 16 }}>
                  <LinearGradient
                    colors={item.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name={`${categoryIcon(item.category)}-outline`} size={22} color={GRADIENT_ICON_COLOR} />
                  </LinearGradient>
                  <View style={{ padding: 12, gap: 6 }}>
                    <T w="600" size={13.5} numberOfLines={2} style={{ lineHeight: 21, minHeight: 42 }}>
                      {L(item.title)}
                    </T>
                    <View style={{ alignSelf: 'flex-start' }}>
                      <Badge
                        label={t(`library.reasons.${item.reason || 'general'}`)}
                        fg={colors.primaryDark} bg={colors.bgSoft}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Featured */}
        {featured && (
          <Card onPress={() => open(featured)} style={{ overflow: 'hidden', borderRadius: 18 }}>
            <LinearGradient
              colors={featured.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ height: 130, justifyContent: 'flex-end', padding: 14 }}
            >
              <Ionicons
                name={`${categoryIcon(featured.category)}-outline`} size={44} color={GRADIENT_ICON_COLOR}
                style={{ position: 'absolute', top: 16, end: 18 }}
              />
              <View style={{ alignSelf: 'flex-start' }}>
                <Badge label={t('library.featured')} fg={colors.primaryDark} bg="rgba(255,255,255,.9)" />
              </View>
            </LinearGradient>
            <View style={{ padding: 16, gap: 6 }}>
              <T w="700" size={16} style={{ lineHeight: 25 }}>{L(featured.title)}</T>
              <T size={12.5} color={colors.muted}>{metaOf(featured)}</T>
            </View>
          </Card>
        )}

        {/* List */}
        {rest.length === 0 && !featured ? (
          <EmptyState icon="search-outline" title={t('library.empty')} />
        ) : (
          <View style={{ gap: 10 }}>
            {rest.map((item) => (
              <Card
                key={item.id} onPress={() => open(item)}
                style={{ padding: 12, flexDirection: 'row', gap: 14, alignItems: 'center' }}
              >
                <LinearGradient
                  colors={item.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 60, height: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                >
                  {item.type === 'audio' ? <Ionicons name="play" size={24} color={colors.purple} />
                    : item.type === 'exercise' ? <Ionicons name="fitness-outline" size={22} color={colors.primaryDark} />
                    : <Ionicons name={`${categoryIcon(item.category)}-outline`} size={24} color={GRADIENT_ICON_COLOR} />}
                </LinearGradient>
                <View style={{ flex: 1, gap: 5 }}>
                  <T w="600" size={14.5} style={{ lineHeight: 22 }}>{L(item.title)}</T>
                  <T size={12} color={colors.muted}>{metaOf(item)}</T>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
