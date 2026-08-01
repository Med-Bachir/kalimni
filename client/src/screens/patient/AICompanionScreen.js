import React, { useEffect, useRef, useState } from 'react';
import {
  View, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView,
  I18nManager, Linking, Alert, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Card, LoadingView, ErrorView } from '../../components/ui';
import SpiritInvite from '../../components/SpiritInvite';
import SpiritAnimal from '../../components/SpiritAnimal';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api, ApiError } from '../../api/client';
import { formatTime } from '../../utils/format';
import { useSpirit } from '../../store/spirit';
import { useSpiritEnergy } from '../../hooks/useSpiritEnergy';

// AI Support Companion chat. The server does the heavy lifting (safety gate,
// RAG, crisis handling); this screen renders the thread, suggestion cards and
// the crisis/emergency treatment, and never pretends the AI is a human.

// Animated "companion is typing" dots.
function TypingDots() {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 320, easing: Easing.ease, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, padding: 14, alignSelf: 'flex-start' }}>
      {anims.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}

const CompanionAvatar = ({ size = 34 }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  }}>
    <Ionicons name="sparkles" size={size * 0.5} color="#fff" />
  </View>
);

export default function AICompanionScreen({ navigation }) {
  const { t, lang, L } = useI18n();
  const queryClient = useQueryClient();
  const listRef = useRef(null);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState(null); // 'rate' | 'unavailable'

  const spiritId = useSpirit((s) => s.id);
  const spiritEnergy = useSpiritEnergy(!!spiritId);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['aiHistory'],
    queryFn: () => api('/ai/history'),
  });

  const send = useMutation({
    mutationFn: (body) => api('/ai/chat', { method: 'POST', body }),
    onMutate: () => setSendError(null),
    onSuccess: (result) => {
      queryClient.setQueryData(['aiHistory'], (old) => {
        if (!old) return old;
        const added = [result.userMessage, result.reply].filter(Boolean);
        return {
          ...old,
          conversation: { ...old.conversation, status: result.status },
          messages: [...old.messages, ...added.filter((m) => !old.messages.some((x) => x.id === m.id))],
        };
      });
    },
    onError: (err) => {
      setSendError(err instanceof ApiError && err.status === 429 ? 'rate' : 'unavailable');
    },
  });

  const messages = data?.messages || [];
  const resources = data?.resources;
  const aiEnabled = data?.aiEnabled !== false;
  const crisisHold = data?.conversation?.status === 'crisis_hold';

  // What the animal in the header is doing.
  //
  // Driven off the two states the screen already tracks, so there is no extra
  // timer and no way for it to get stuck: the reply is in flight, or there is
  // a draft in the box, or neither.
  //
  // Order matters — a reply in flight wins over a draft, because someone who
  // starts typing their next thought while waiting should still see the
  // companion working rather than the animal snapping back to attention.
  const petMood = send.isPending ? 'thinking' : text.trim() ? 'listening' : 'idle';

  const submit = (value) => {
    const body = String(value ?? text).trim();
    if (!body || send.isPending) return;
    setText('');
    send.mutate({ text: body });
  };

  const clearThread = () => {
    Alert.alert(t('companion.clearConfirmTitle'), t('companion.clearConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/ai/history', { method: 'DELETE' });
          } catch (err) {
            // The wipe is refused while a safety alert is open (the specialist
            // still needs the thread). Say so instead of failing silently.
            if (err?.code === 'crisis_hold_active') {
              Alert.alert(t('companion.clearBlockedTitle'), t('companion.clearBlockedBody'));
            }
          }
          queryClient.invalidateQueries({ queryKey: ['aiHistory'] });
        },
      },
    ]);
  };

  const openSuggestion = (s) => {
    if (s.kind === 'exercise' && s.screen === 'Breathing') return navigation.navigate('Breathing');
    if (s.contentId) return navigation.navigate('Article', { id: s.contentId });
    if (s.kind === 'exercise') return submit(t('companion.askExercise', { title: L(s.title) }));
    return undefined;
  };

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const renderSuggestions = (m) =>
    (m.suggestions || []).length > 0 && (
      // width (not maxWidth): the message row has alignItems flex-start, so an
      // auto-width wrapper would collapse the flex:1 title column to nothing.
      <View style={{ gap: 8, marginTop: 8, width: '86%' }}>
        {m.suggestions.map((s, i) => (
          <Card
            key={`${m.id}-s${i}`}
            onPress={() => openSuggestion(s)}
            style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 11, backgroundColor: colors.bgSoft,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons
                name={s.kind === 'exercise' ? 'fitness-outline' : 'book-outline'}
                size={18} color={colors.primary}
              />
            </View>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <T size={11.5} w="600" color={colors.faint}>
                {t(s.kind === 'exercise' ? 'companion.suggestedExercise' : 'companion.suggestedRead')}
              </T>
              <T w="600" size={13.5} numberOfLines={1}>{L(s.title)}</T>
            </View>
            <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={15} color={colors.faint} />
          </Card>
        ))}
      </View>
    );

  // Fixed crisis response bubble + emergency resources + crisis screen link.
  const renderCrisis = (m) => (
    <View style={{ marginBottom: 14, gap: 8 }}>
      <View style={{
        backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: colors.dangerBorder,
        padding: 14, gap: 10,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="heart" size={17} color={colors.dangerDark} />
          <T w="700" size={14} color={colors.dangerDark}>{t('companion.emergencyTitle')}</T>
        </View>
        <T size={14} style={{ lineHeight: 24 }}>{m.text}</T>
        {resources?.resources?.map((r) => (
          <TouchableOpacity
            key={r.id}
            onPress={() => Linking.openURL(`tel:${r.phone}`)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.dangerBg,
              borderRadius: 12, padding: 12,
            }}
          >
            <Ionicons name="call" size={17} color={colors.dangerDark} />
            <View style={{ flex: 1 }}>
              <T w="700" size={13.5} color={colors.dangerDark}>{L(r.name)}</T>
              <T size={11.5} color={colors.dangerDark}>{L(r.available)}</T>
            </View>
            <T w="700" size={16} color={colors.dangerDark}>{r.phone}</T>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => navigation.navigate('Crisis')}>
          <T w="600" size={13} color={colors.dangerDark}>{t('companion.openCrisis')}</T>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMessage = ({ item: m }) => {
    if (m.role === 'crisis') return renderCrisis(m);
    const mine = m.role === 'user';
    return (
      <View style={{ marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View style={{ flexDirection: 'row', gap: 8, maxWidth: '86%', alignItems: 'flex-end' }}>
          {!mine && <CompanionAvatar size={28} />}
          <View style={{
            paddingHorizontal: 15, paddingVertical: 11, borderRadius: 18, flexShrink: 1,
            backgroundColor: mine ? colors.primary : '#fff',
            ...(mine ? { borderBottomEndRadius: 5 } : { borderBottomStartRadius: 5 }),
          }}>
            <T size={14.5} color={mine ? '#fff' : colors.ink} style={{ lineHeight: 25 }}>{m.text}</T>
          </View>
        </View>
        {!mine && renderSuggestions(m)}
        <T size={10.5} color={colors.faint} style={{ marginTop: 3, marginHorizontal: mine ? 6 : 42 }}>
          {formatTime(m.createdAt, lang)}
        </T>
      </View>
    );
  };

  return (
    <Screen edges={['top']} bg={colors.bgChat}>
      {/* `padding` on both platforms — see the note in components/ChatView.js.
          Android's window no longer resizes behind the keyboard under
          edge-to-edge, so `undefined` here meant this did nothing at all. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card,
          paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
        }}>
          <CompanionAvatar />

          {/* The spirit animal, lying down beside the companion.

              It is not a second avatar and it is not decoration: it is the only
              thing on this screen that reacts while you are mid-sentence. Ears
              up and eyes wide the moment you start typing, head tilted away
              while the companion is composing a reply, dozing the rest of the
              time. A room with something alive in it feels different from a
              room with a text box in it. */}
          {spiritId && (
            <SpiritAnimal
              id={spiritId}
              size={44}
              pose="lie"
              mood={petMood}
              energy={spiritEnergy ?? 3}
              aura={false}
              style={{ marginTop: 2 }}
            />
          )}

          <View style={{ flex: 1, gap: 1 }}>
            <T w="700" size={16}>{t('companion.title')}</T>
            <T size={11.5} color={colors.faint} numberOfLines={1}>{t('companion.disclaimer')}</T>
          </View>
          {messages.length > 0 && (
            <TouchableOpacity onPress={clearThread} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={19} color={colors.faint} />
            </TouchableOpacity>
          )}
        </View>

        {/* The spirit animal used to live here, as a strip under the header —
            which made it read as another bar of chrome rather than an animal.
            It now roams the whole app (components/FloatingSpirit), so all this
            screen needs is an invitation for someone who has not met it yet.
            Once they have, nothing is pinned here at all. */}
        {aiEnabled && <SpiritInvite onPress={() => navigation.navigate('SpiritQuiz')} />}

        {/* Specialist switched the companion off */}
        {!aiEnabled ? (
          <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
            <Card style={{ padding: 22, alignItems: 'center', gap: 10 }}>
              <Ionicons name="pause-circle-outline" size={40} color={colors.warn} />
              <T w="700" size={16}>{t('companion.disabledTitle')}</T>
              <T size={13.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 22 }}>
                {t('companion.disabledBody')}
              </T>
            </Card>
          </View>
        ) : (
          <>
            {crisisHold && (
              <View style={{
                margin: 12, marginBottom: 0, backgroundColor: colors.warnBg, borderRadius: 12,
                padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Ionicons name="pause-circle-outline" size={18} color={colors.warn} />
                <T size={12.5} color={colors.warn} style={{ flex: 1, lineHeight: 19 }}>{t('companion.crisisHold')}</T>
              </View>
            )}

            {messages.length === 0 ? (
              <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
                <View style={{ alignItems: 'center', gap: 10 }}>
                  <CompanionAvatar size={64} />
                  <T w="700" size={18}>{t('companion.emptyTitle')}</T>
                  <T size={13.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 23 }}>
                    {t('companion.emptyBody')}
                  </T>
                </View>
                <View style={{ gap: 8 }}>
                  {['starter1', 'starter2', 'starter3'].map((key) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => submit(t(`companion.${key}`))}
                      style={{
                        backgroundColor: colors.card, borderRadius: 14, borderWidth: 1.5,
                        borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12,
                      }}
                    >
                      <T w="600" size={13.5} color={colors.primaryDark}>{t(`companion.${key}`)}</T>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={renderMessage}
                contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
                ListFooterComponent={send.isPending ? <TypingDots /> : null}
                keyboardShouldPersistTaps="handled"
              />
            )}

            {/* Send failure: keep the draft, offer retry */}
            {sendError && (
              <View style={{
                marginHorizontal: 12, marginBottom: 6, backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1.5, borderColor: sendError === 'rate' ? colors.border : colors.dangerBorder,
                padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Ionicons
                  name={sendError === 'rate' ? 'hourglass-outline' : 'cloud-offline-outline'}
                  size={17} color={sendError === 'rate' ? colors.warn : colors.dangerDark}
                />
                <T size={12.5} color={colors.body} style={{ flex: 1, lineHeight: 19 }}>
                  {t(sendError === 'rate' ? 'companion.rateLimited' : 'companion.errorRetry')}
                </T>
                {sendError !== 'rate' && (
                  <TouchableOpacity onPress={() => submit(send.variables?.text)}>
                    <T w="700" size={12.5} color={colors.primary}>{t('companion.retry')}</T>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Composer */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card,
              paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
            }}>
              <TouchableOpacity
                onPress={() => submit()}
                disabled={!text.trim() || send.isPending}
                style={{
                  width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: text.trim() && !send.isPending ? colors.primary : colors.track,
                }}
              >
                <Ionicons
                  name="send" size={18} color="#fff"
                  style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}
                />
              </TouchableOpacity>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t('companion.placeholder')}
                placeholderTextColor={colors.faint}
                multiline
                style={{
                  flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 23, backgroundColor: colors.bgChat,
                  paddingHorizontal: 18, paddingVertical: 11, fontSize: 14.5, color: colors.ink,
                  fontFamily: 'IBMPlexSansArabic_400Regular',
                  textAlign: I18nManager.isRTL ? 'right' : 'left',
                }}
              />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
