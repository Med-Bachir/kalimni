import React from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, CountBadge, LoadingView, ErrorView, EmptyState } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { formatWhen, localizeDigits } from '../../utils/format';

export default function ConversationsScreen({ navigation }) {
  const { t, lang } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api('/conversations'),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const conversations = data.conversations || [];

  return (
    <Screen>
      <View style={{ padding: 22, paddingBottom: 12 }}>
        <T w="700" size={22}>{t('tabs.chats')}</T>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 22, gap: 10 }}>
        {conversations.length === 0 ? (
          <EmptyState icon="chatbubble-ellipses-outline" title={t('chat.emptyTitle')} />
        ) : (
          conversations.map((c) => (
            <Card
              key={c.id}
              onPress={() => navigation.navigate('Chat', { conversationId: c.id })}
              style={{ padding: 14, flexDirection: 'row', gap: 13, alignItems: 'center', borderRadius: 17 }}
            >
              <Avatar name={c.partner?.name} size={52} online={c.partner?.online} />
              <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T w="700" size={15.5}>{c.partner?.name}</T>
                  {c.lastMessage ? (
                    <T size={11.5} color={colors.faint}>{formatWhen(c.lastMessage.createdAt, lang, t)}</T>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <T size={13} color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>
                    {c.lastMessage?.audioUrl
                      ? `🎤 ${t('chat.voiceMessage')}`
                      : c.lastMessage?.text || t('specialist.noMessages')}
                  </T>
                  {c.unreadCount > 0 ? <CountBadge count={localizeDigits(c.unreadCount, lang)} /> : null}
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
