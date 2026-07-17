import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, I18nManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Badge, BackButton, LoadingView, ErrorView, Avatar } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { formatDate } from '../../utils/format';

export default function ArticleScreen({ navigation, route }) {
  const { id } = route.params;
  const { t, lang, L } = useI18n();
  const [bookmarked, setBookmarked] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['content', id],
    queryFn: () => api(`/content/${id}`),
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const item = data.item;

  return (
    <Screen bg={colors.card} edges={[]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient
          colors={item.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ height: 210, padding: 20, paddingTop: 50, justifyContent: 'space-between' }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <BackButton onPress={() => navigation.goBack()} />
            <TouchableOpacity
              onPress={() => setBookmarked((v) => !v)}
              style={{
                width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.9)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={19} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <View style={{ alignSelf: 'flex-start' }}>
            <Badge label={t(`library.categories.${item.category}`)} fg={colors.primaryDark} bg="rgba(255,255,255,.9)" />
          </View>
        </LinearGradient>

        {/* Body */}
        <View style={{ padding: 24, gap: 16 }}>
          <T w="700" size={23} style={{ lineHeight: 36 }}>{L(item.title)}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={L(item.author)} size={34} color={[colors.primary, '#fff']} />
            <View>
              <T w="600" size={13}>{L(item.author)}</T>
              <T size={11.5} color={colors.faint}>
                {t('library.minRead', { n: item.minutes })} · {formatDate(item.createdAt, lang)}
              </T>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.divider }} />

          {(item.body || []).map((block, i) => {
            if (block.type === 'h') {
              return <T key={i} w="700" size={16} style={{ marginTop: 4 }}>{L(block.text)}</T>;
            }
            if (block.type === 'exercise') {
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Breathing')}
                  style={{
                    borderRadius: 14, backgroundColor: colors.bgSoft, padding: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                  }}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: 'rgba(255,255,255,.85)' }} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T w="700" size={14}>{L(block.text)}</T>
                    <T size={12} color={colors.muted}>{t('article.exerciseMeta')}</T>
                  </View>
                  <Ionicons
                    name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
                    size={18} color={colors.primary}
                  />
                </TouchableOpacity>
              );
            }
            return (
              <T key={i} size={15.5} color={colors.body} style={{ lineHeight: 30 }}>
                {L(block.text)}
              </T>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}
