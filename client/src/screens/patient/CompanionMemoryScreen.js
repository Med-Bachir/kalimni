import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, Alert, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Card, BackButton, Button, LoadingView, ErrorView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';

// "What your companion remembers" (Phase 2.4).
//
// The server keeps a rolling summary of this patient's conversations, and it
// used to be something written about them that they could not see. This screen
// is the correction: every line is shown, every line can be deleted, and the
// whole thing can be rewritten in their own words.
//
// Two things the copy has to be honest about, because the alternative is a
// promise the system cannot keep:
//   * deleting a line means the companion is told to leave it out of future
//     summaries too — not that the conversation it came from is erased. The
//     thread has its own delete, on the companion screen.
//   * anything already shared in a session brief has been read by someone. It
//     is not retracted by editing this.

export default function CompanionMemoryScreen({ navigation }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const memory = useQuery({ queryKey: ['aiMemory'], queryFn: () => api('/ai/memory') });

  const onWritten = (data) => {
    queryClient.setQueryData(['aiMemory'], data);
    // The home-screen follow-up and the companion thread both read this state.
    queryClient.invalidateQueries({ queryKey: ['aiFollowUp'] });
    queryClient.invalidateQueries({ queryKey: ['aiHistory'] });
  };

  const rewrite = useMutation({
    mutationFn: (text) => api('/ai/memory', { method: 'PUT', body: { text } }),
    onSuccess: (data) => { onWritten(data); setEditing(false); },
  });
  const forgetLine = useMutation({
    mutationFn: (id) => api(`/ai/memory/lines/${id}`, { method: 'DELETE' }),
    onSuccess: onWritten,
  });
  const forgetAll = useMutation({
    mutationFn: () => api('/ai/memory', { method: 'DELETE' }),
    onSuccess: onWritten,
  });

  if (memory.isLoading) return <LoadingView />;
  if (memory.isError) return <ErrorView onRetry={memory.refetch} />;

  const lines = memory.data?.lines || [];
  const topics = memory.data?.topics || [];

  const startEditing = () => {
    setDraft(lines.map((l) => l.text).join(' '));
    setEditing(true);
  };

  const confirmForgetAll = () => {
    Alert.alert(t('memory.forgetAllConfirmTitle'), t('memory.forgetAllConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('memory.forgetAll'), style: 'destructive', onPress: () => forgetAll.mutate() },
    ]);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22} style={{ flex: 1 }}>{t('memory.title')}</T>
        </View>

        <Card style={{ padding: 16, gap: 8, backgroundColor: colors.bgSoft, borderColor: colors.bgSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="bookmark-outline" size={17} color={colors.primary} />
            <T w="700" size={13.5} color={colors.primary}>{t('memory.introTitle')}</T>
          </View>
          <T size={13} color={colors.body} style={{ lineHeight: 21 }}>{t('memory.intro')}</T>
        </Card>

        {editing ? (
          <View style={{ gap: 12 }}>
            <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>{t('memory.editHint')}</T>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={1500}
              placeholder={t('memory.editPlaceholder')}
              placeholderTextColor={colors.faint}
              style={{
                minHeight: 160, borderRadius: 14, backgroundColor: colors.card,
                borderWidth: 1.5, borderColor: colors.inputBorder, padding: 14,
                fontSize: 14.5, lineHeight: 24, color: colors.ink,
                fontFamily: 'IBMPlexSansArabic_400Regular',
                textAlign: I18nManager.isRTL ? 'right' : 'left',
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title={t('common.save')} style={{ flex: 1 }}
                loading={rewrite.isPending}
                onPress={() => rewrite.mutate(draft)}
              />
              <Button
                title={t('common.cancel')} variant="light" style={{ flex: 1 }}
                onPress={() => setEditing(false)}
              />
            </View>
          </View>
        ) : lines.length === 0 ? (
          <Card style={{ padding: 22, alignItems: 'center', gap: 10 }}>
            <Ionicons name="cloud-outline" size={38} color={colors.faint} />
            <T w="700" size={15.5}>{t('memory.emptyTitle')}</T>
            <T size={13} color={colors.muted} style={{ textAlign: 'center', lineHeight: 22 }}>
              {t('memory.emptyBody')}
            </T>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {lines.map((line) => (
              <View
                key={line.id}
                style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
                  borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12,
                }}
              >
                <T size={14} style={{ flex: 1, lineHeight: 23 }}>{line.text}</T>
                <TouchableOpacity
                  onPress={() => forgetLine.mutate(line.id)}
                  disabled={forgetLine.isPending}
                  hitSlop={10}
                  accessibilityLabel={t('memory.forgetLine')}
                >
                  <Ionicons name="close-circle" size={21} color={colors.faint} />
                </TouchableOpacity>
              </View>
            ))}

            {topics.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {topics.map((topic) => (
                  <View key={topic} style={{
                    backgroundColor: colors.bgSoft, borderRadius: 999,
                    paddingHorizontal: 11, paddingVertical: 5,
                  }}>
                    <T size={11.5} color={colors.muted}>{topic}</T>
                  </View>
                ))}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <Button title={t('memory.edit')} variant="light" style={{ flex: 1 }} onPress={startEditing} />
              <Button title={t('memory.forgetAll')} variant="light" style={{ flex: 1 }} onPress={confirmForgetAll} />
            </View>
          </View>
        )}

        {/* The limits, stated rather than implied. */}
        <View style={{ gap: 8, marginTop: 4 }}>
          <T size={12} color={colors.faint} style={{ lineHeight: 19 }}>{t('memory.noteForget')}</T>
          <T size={12} color={colors.faint} style={{ lineHeight: 19 }}>{t('memory.noteShared')}</T>
          {memory.data?.forgottenCount > 0 && (
            <T size={12} color={colors.faint} style={{ lineHeight: 19 }}>
              {t('memory.forgottenCount', { n: memory.data.forgottenCount })}
            </T>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
