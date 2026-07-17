import React from 'react';
import { Screen } from '../../components/ui';
import { colors } from '../../theme/colors';
import ChatView from '../../components/ChatView';

// Stack-pushed chat (specialist opening a patient conversation).
export default function ChatScreen({ navigation, route }) {
  const { conversationId } = route.params;
  return (
    <Screen edges={['top', 'bottom']} bg={colors.card}>
      <ChatView
        conversationId={conversationId}
        onBack={() => navigation.goBack()}
        navigation={navigation}
      />
    </Screen>
  );
}
