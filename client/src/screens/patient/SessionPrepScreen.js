import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, Alert, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Card, BackButton, Button, LoadingView, ErrorView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { formatDate } from '../../utils/format';

// Session Witness — the patient's side (Phase 2.3).
//
// The whole screen is one question: what do you want your specialist to know
// before you sit down? Their own three lines first, then a set of cards the
// app assembled about them — every one of which starts unticked. Nothing on
// this screen is sent until they press the button at the bottom, and the
// button says so.
//
// The safety card is the exception and it looks different on purpose: no
// checkbox, a lock icon, and copy saying the specialist already sees it. A
// checkbox there would be either decorative or a way to suppress an alert.

const ICONS = {
  notes: 'create-outline',
  takeaway: 'return-down-back-outline',
  checkins: 'stats-chart-outline',
  themes: 'chatbubbles-outline',
  exercises: 'leaf-outline',
  safety: 'shield-checkmark-outline',
};

function ItemCard({ item, lang, t, checked, onToggle }) {
  const locked = !!item.locked;
  return (
    <Card
      style={{
        padding: 14, gap: 10,
        borderColor: locked ? colors.warnBg : checked ? colors.primary : colors.border,
        backgroundColor: locked ? colors.warnBg : colors.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons
          name={ICONS[item.id] || 'document-text-outline'}
          size={18}
          color={locked ? colors.warn : colors.primary}
        />
        <T w="700" size={14.5} style={{ flex: 1 }}>{item.title?.[lang] || item.title?.ar}</T>
        {locked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="lock-closed" size={14} color={colors.warn} />
            <T size={11.5} w="600" color={colors.warn}>{t('witness.alwaysShared')}</T>
          </View>
        ) : (
          <TouchableOpacity
            onPress={onToggle}
            hitSlop={10}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={item.title?.[lang] || item.title?.ar}
          >
            <Ionicons
              name={checked ? 'checkbox' : 'square-outline'}
              size={24}
              color={checked ? colors.primary : colors.faint}
            />
          </TouchableOpacity>
        )}
      </View>

      <T size={13.5} color={colors.body} style={{ lineHeight: 22 }}>{item.body}</T>

      {item.fromMemory && (
        <T size={11.5} color={colors.faint} style={{ lineHeight: 18 }}>{t('witness.fromMemory')}</T>
      )}
    </Card>
  );
}

export default function SessionPrepScreen({ navigation, route }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const appointmentId = route?.params?.appointmentId;

  const [notes, setNotes] = useState(['', '', '']);
  const [included, setIncluded] = useState(null); // null until the draft loads
  const [hydrated, setHydrated] = useState(false);

  const draft = useQuery({
    queryKey: ['witnessDraft', appointmentId || null],
    queryFn: () => api(`/witness/draft${appointmentId ? `?appointmentId=${appointmentId}` : ''}`),
    retry: false,
  });

  const brief = draft.data?.brief;
  const items = brief?.items || [];

  // Seed the local form from the server draft once; after that the patient's
  // typing wins until they leave.
  useEffect(() => {
    if (!brief || hydrated) return;
    const noteItem = items.find((i) => i.id === 'notes');
    const lines = String(noteItem?.body || '').split('\n');
    setNotes([lines[0] || '', lines[1] || '', lines[2] || '']);
    setIncluded(new Set(items.filter((i) => i.included).map((i) => i.id)));
    setHydrated(true);
  }, [brief, hydrated]);

  const save = useMutation({
    mutationFn: (body) => api('/witness/draft', { method: 'PUT', body }),
    onSuccess: (data) => queryClient.setQueryData(['witnessDraft', appointmentId || null], {
      ...draft.data, brief: data.brief,
    }),
  });

  const share = useMutation({
    mutationFn: () => api('/witness/draft/share', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['witnessDraft'] });
      queryClient.invalidateQueries({ queryKey: ['witnessBriefs'] });
      Alert.alert(t('witness.sentTitle'), t('witness.sentBody'));
      navigation.goBack();
    },
    onError: (err) => Alert.alert(
      t('common.errorTitle'),
      err?.code === 'nothing_selected' ? t('witness.nothingSelected') : t('common.networkError')
    ),
  });

  const discard = useMutation({
    mutationFn: () => api('/witness/draft', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['witnessDraft'] });
      navigation.goBack();
    },
  });

  if (draft.isLoading) return <LoadingView />;
  if (draft.isError) {
    // The only expected failure: a patient with no specialist yet.
    if (draft.error?.code === 'no_specialist') {
      return (
        <Screen edges={['top', 'bottom']}>
          <View style={{ padding: 22, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <BackButton onPress={() => navigation.goBack()} />
              <T w="700" size={22}>{t('witness.title')}</T>
            </View>
            <Card style={{ padding: 22, alignItems: 'center', gap: 10 }}>
              <Ionicons name="person-add-outline" size={38} color={colors.faint} />
              <T size={13.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 22 }}>
                {t('witness.noSpecialist')}
              </T>
            </Card>
          </View>
        </Screen>
      );
    }
    return <ErrorView onRetry={draft.refetch} />;
  }

  const isIncluded = (id) => included?.has(id);
  const toggle = (id) => {
    const next = new Set(included);
    if (next.has(id)) next.delete(id); else next.add(id);
    setIncluded(next);
    save.mutate({ notes: notes.filter(Boolean), includedIds: [...next] });
  };

  const commitNotes = () => save.mutate({ notes: notes.filter((n) => n.trim()) });

  const sharedCount = items.filter((i) => i.locked || isIncluded(i)).length;

  const confirmShare = () => {
    Alert.alert(t('witness.confirmTitle'), t('witness.confirmBody', { n: sharedCount }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('witness.send'), onPress: () => { commitNotes(); share.mutate(); } },
    ]);
  };

  const noteItem = items.find((i) => i.id === 'notes');
  const rest = items.filter((i) => i.id !== 'notes');

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22} style={{ flex: 1 }}>{t('witness.title')}</T>
        </View>

        <Card style={{ padding: 16, gap: 8, backgroundColor: colors.bgSoft, borderColor: colors.bgSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="hand-left-outline" size={17} color={colors.primary} />
            <T w="700" size={13.5} color={colors.primary}>{t('witness.introTitle')}</T>
          </View>
          <T size={13} color={colors.body} style={{ lineHeight: 21 }}>{t('witness.intro')}</T>
        </Card>

        {/* The patient's own three lines — first on the screen, because they
            are the point and everything else is context for them. */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <T w="700" size={15.5} style={{ flex: 1 }}>
              {noteItem?.title?.[lang] || t('witness.notesTitle')}
            </T>
          </View>
          <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>{t('witness.notesHint')}</T>
          {notes.map((value, i) => (
            <TextInput
              key={i}
              value={value}
              onChangeText={(text) => setNotes(notes.map((n, j) => (j === i ? text : n)))}
              onBlur={commitNotes}
              maxLength={300}
              multiline
              placeholder={t(`witness.notePlaceholder${i + 1}`)}
              placeholderTextColor={colors.faint}
              style={{
                minHeight: 52, borderRadius: 12, backgroundColor: colors.card,
                borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 14, lineHeight: 22, color: colors.ink,
                fontFamily: 'IBMPlexSansArabic_400Regular',
                textAlign: I18nManager.isRTL ? 'right' : 'left',
                textAlignVertical: 'top',
              }}
            />
          ))}
        </View>

        {rest.length > 0 && (
          <View style={{ gap: 10, marginTop: 4 }}>
            <T w="700" size={15.5}>{t('witness.attachTitle')}</T>
            <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>{t('witness.attachHint')}</T>
            {rest.map((item) => (
              <ItemCard
                key={item.id} item={item} lang={lang} t={t}
                checked={!!isIncluded(item.id)}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </View>
        )}

        <View style={{ gap: 10, marginTop: 6 }}>
          <Button
            title={t('witness.send')}
            loading={share.isPending}
            disabled={sharedCount === 0 && !notes.some((n) => n.trim())}
            onPress={confirmShare}
          />
          <TouchableOpacity onPress={() => discard.mutate()} style={{ alignSelf: 'center', padding: 6 }}>
            <T w="600" size={13} color={colors.muted}>{t('witness.discard')}</T>
          </TouchableOpacity>
          <T size={11.5} color={colors.faint} style={{ textAlign: 'center', lineHeight: 19 }}>
            {t('witness.footer')}
          </T>
        </View>
      </ScrollView>
    </Screen>
  );
}

// --- the "after" half: one line, written once the session is over -----------------
// Reached from History and from the appointment card of a finished session.
export function SessionTakeawayScreen({ navigation, route }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const briefs = useQuery({ queryKey: ['witnessBriefs'], queryFn: () => api('/witness/briefs') });
  const target = route?.params?.briefId
    ? (briefs.data?.briefs || []).find((b) => b.id === route.params.briefId)
    : (briefs.data?.briefs || [])[0];

  const save = useMutation({
    mutationFn: () => api(`/witness/briefs/${target.id}/takeaway`, { method: 'POST', body: { text } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['witnessBriefs'] });
      navigation.goBack();
    },
  });

  if (briefs.isLoading) return <LoadingView />;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22} style={{ flex: 1 }}>{t('witness.takeawayTitle')}</T>
        </View>

        {!target ? (
          <Card style={{ padding: 22, alignItems: 'center', gap: 10 }}>
            <Ionicons name="chatbox-outline" size={38} color={colors.faint} />
            <T size={13.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 22 }}>
              {t('witness.takeawayNoBrief')}
            </T>
          </Card>
        ) : (
          <>
            <T size={13} color={colors.body} style={{ lineHeight: 21 }}>{t('witness.takeawayIntro')}</T>
            <TextInput
              value={text || target.takeaway || ''}
              onChangeText={setText}
              multiline
              maxLength={500}
              placeholder={t('witness.takeawayPlaceholder')}
              placeholderTextColor={colors.faint}
              style={{
                minHeight: 120, borderRadius: 14, backgroundColor: colors.card,
                borderWidth: 1.5, borderColor: colors.inputBorder, padding: 14,
                fontSize: 14.5, lineHeight: 24, color: colors.ink,
                fontFamily: 'IBMPlexSansArabic_400Regular',
                textAlign: I18nManager.isRTL ? 'right' : 'left',
                textAlignVertical: 'top',
              }}
            />
            <T size={11.5} color={colors.faint} style={{ lineHeight: 19 }}>
              {target.status === 'shared' ? t('witness.takeawayShared') : t('witness.takeawayPrivate')}
            </T>
            <Button title={t('common.save')} loading={save.isPending} onPress={() => save.mutate()} />
            <T size={11.5} color={colors.faint} style={{ textAlign: 'center' }}>
              {t('witness.takeawayFrom', { date: formatDate(target.createdAt, lang) })}
            </T>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
