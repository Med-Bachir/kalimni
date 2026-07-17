import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Screen, LoadingView, ErrorView, EmptyState } from '../../components/ui';
import { colors } from '../../theme/colors';
import ChatView from '../../components/ChatView';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';

// Patients have a single conversation with their assigned specialist, so the
// chat tab opens it directly (or shows the "waiting for a match" state).
export default function PatientChatTab({ navigation }) {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api('/conversations'),
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const conversation = data.conversations[0];
  if (!conversation) {
    return (
      <Screen>
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title={t('chat.emptyTitle')}
          body={t('chat.emptyBody')}
        />
      </Screen>
    );
  }

  return (
    <Screen bg={colors.card}>
      <ChatView conversationId={conversation.id} navigation={navigation} />
    </Screen>
  );
}
