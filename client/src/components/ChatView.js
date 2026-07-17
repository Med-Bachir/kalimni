import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, I18nManager, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useAudioRecorder, useAudioPlayer, useAudioPlayerStatus,
  RecordingPresets, AudioModule, setAudioModeAsync,
} from 'expo-audio';
import { T, Avatar, BackButton, LoadingView, ErrorView } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { api, apiUpload, getAuthToken } from '../api/client';
import { SOCKET_URL } from '../config';
import { getSocket } from '../api/socket';
import { useAuth } from '../store/auth';
import { useCall } from '../store/call';
import { formatTime } from '../utils/format';
import AppointmentCard from './AppointmentCard';
import ProposeSessionModal from './ProposeSessionModal';

const dayKey = (iso) => new Date(iso).toDateString();
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const MAX_RECORD_MS = 120_000; // matches the server cap

// Playable voice-note bubble: play/pause, progress bar, duration.
function VoiceBubble({ message, mine }) {
  const player = useAudioPlayer({
    uri: `${SOCKET_URL}${message.audioUrl}?token=${getAuthToken()}`,
  });
  const status = useAudioPlayerStatus(player);

  const fg = mine ? '#fff' : colors.primary;
  const totalS = status.duration > 0 ? status.duration : (message.audioDurationMs || 0) / 1000;
  const shownS = status.playing || status.currentTime > 0 ? status.currentTime : totalS;
  const progress = totalS > 0 ? Math.min(status.currentTime / totalS, 1) : 0;

  const toggle = () => {
    if (status.playing) return player.pause();
    // Replay from the start once finished.
    if (status.didJustFinish || (totalS > 0 && status.currentTime >= totalS - 0.05)) player.seekTo(0);
    return player.play();
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 170 }}>
      <TouchableOpacity
        onPress={toggle}
        style={{
          width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
          backgroundColor: mine ? 'rgba(255,255,255,.25)' : colors.bgSoft,
        }}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={fg} />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ height: 3.5, borderRadius: 2, backgroundColor: mine ? 'rgba(255,255,255,.3)' : colors.track }}>
          <View style={{ width: `${progress * 100}%`, height: 3.5, borderRadius: 2, backgroundColor: fg }} />
        </View>
        <T size={11} color={mine ? 'rgba(255,255,255,.8)' : colors.muted}>{mmss(shownS)}</T>
      </View>
    </View>
  );
}

export default function ChatView({ conversationId, onBack, navigation }) {
  const { t, lang, L } = useI18n();
  const user = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const listRef = useRef(null);
  const typingTimeout = useRef(null);
  const [text, setText] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showRiskBanner, setShowRiskBanner] = useState(false);
  const [showPropose, setShowPropose] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api(`/conversations/${conversationId}/messages`),
  });

  // Next upcoming (proposed/confirmed) session for this conversation, if any.
  const { data: apptData } = useQuery({
    queryKey: ['appointments', 'conversation', conversationId],
    queryFn: () => api(`/appointments?conversationId=${conversationId}`),
  });
  const nextAppointment = (apptData?.appointments || []).find((a) =>
    ['proposed', 'confirmed'].includes(a.status) && new Date(a.scheduledAt).getTime() > Date.now() - 3600_000
  );

  const partner = data?.conversation?.partner;
  const messages = data?.messages || [];
  const unreadFromPartner = messages.some((m) => m.senderId !== user.id && !m.readAt);

  // Raise the crisis banner whenever one of the patient's own messages is
  // flagged — covers the async risk scan, which flips the flag after the
  // message was already delivered (message:update lands in the cache here).
  const hasOwnFlagged = user.role === 'patient' && messages.some((m) => m.senderId === user.id && m.riskFlag);
  useEffect(() => {
    if (hasOwnFlagged) setShowRiskBanner(true);
  }, [hasOwnFlagged]);

  // Mark incoming messages as read while this screen is open.
  useEffect(() => {
    if (!unreadFromPartner) return;
    api(`/conversations/${conversationId}/read`, { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => {});
  }, [conversationId, unreadFromPartner, messages.length]);

  // Partner typing indicator.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onTyping = (payload) => {
      if (payload.conversationId === conversationId && payload.userId !== user.id) {
        setPartnerTyping(payload.typing);
      }
    };
    socket.on('typing', onTyping);
    return () => socket.off('typing', onTyping);
  }, [conversationId, user.id]);

  const send = useMutation({
    mutationFn: (body) => api(`/conversations/${conversationId}/messages`, { method: 'POST', body }),
    onSuccess: ({ message }) => {
      queryClient.setQueryData(['messages', conversationId], (old) => {
        if (!old || old.messages.some((m) => m.id === message.id)) return old;
        return { ...old, messages: [...old.messages, message] };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Patient safety net: a flagged message opens the crisis resources banner.
      if (message.riskFlag && user.role === 'patient') setShowRiskBanner(true);
    },
  });

  const submit = () => {
    const value = text.trim();
    if (!value || send.isPending) return;
    setText('');
    emitTyping(false);
    send.mutate({ text: value });
  };

  // --- voice recording ---------------------------------------------------------
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const recordTimer = useRef(null);
  const recordStart = useRef(0);

  const sendVoice = useMutation({
    mutationFn: (formData) => apiUpload(`/conversations/${conversationId}/voice`, formData),
    onSuccess: ({ message }) => {
      queryClient.setQueryData(['messages', conversationId], (old) => {
        if (!old || old.messages.some((m) => m.id === message.id)) return old;
        return { ...old, messages: [...old.messages, message] };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return Alert.alert(t('chat.micDenied'));
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordStart.current = Date.now();
    setRecordMs(0);
    setRecording(true);
    recordTimer.current = setInterval(() => {
      const ms = Date.now() - recordStart.current;
      setRecordMs(ms);
      if (ms >= MAX_RECORD_MS) finishRecording(true); // auto-send at the cap
    }, 250);
    return undefined;
  };

  const finishRecording = async (sendIt) => {
    clearInterval(recordTimer.current);
    setRecording(false);
    let uri = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      return; // recorder died — nothing to send
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (!sendIt || !uri) return;

    const durationMs = Math.min(Date.now() - recordStart.current, MAX_RECORD_MS);
    if (durationMs < 700) return; // accidental tap — discard blips

    const formData = new FormData();
    formData.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' });
    formData.append('durationMs', String(durationMs));
    sendVoice.mutate(formData);
  };

  useEffect(() => () => clearInterval(recordTimer.current), []);

  const emitTyping = (typing) => {
    getSocket()?.emit('typing', { conversationId, typing });
  };

  const onChangeText = (value) => {
    setText(value);
    emitTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emitTyping(false), 1500);
  };

  // Insert day separators.
  const rows = useMemo(() => {
    const out = [];
    let lastDay = null;
    messages.forEach((m) => {
      const key = dayKey(m.createdAt);
      if (key !== lastDay) {
        lastDay = key;
        const isToday = key === new Date().toDateString();
        out.push({ type: 'day', id: `day-${key}`, label: isToday ? t('common.today') : key });
      }
      out.push({ type: 'msg', id: m.id, message: m });
    });
    return out;
  }, [messages, lang]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const renderRow = ({ item }) => {
    if (item.type === 'day') {
      return (
        <View style={{ alignSelf: 'center', backgroundColor: colors.bgSoft, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginVertical: 6 }}>
          <T w="600" size={11.5} color={colors.faint}>{item.label}</T>
        </View>
      );
    }
    const m = item.message;
    const mine = m.senderId === user.id;
    const flaggedForSpecialist = m.riskFlag && user.role === 'specialist' && !mine;
    return (
      <View style={{ marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View
          style={{
            maxWidth: '78%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18,
            backgroundColor: mine ? colors.primary : '#fff',
            ...(mine ? { borderBottomEndRadius: 5 } : { borderBottomStartRadius: 5 }),
            ...(flaggedForSpecialist && { borderWidth: 1.5, borderColor: colors.danger }),
          }}
        >
          {m.audioUrl ? (
            <VoiceBubble message={m} mine={mine} />
          ) : (
            <T size={15} color={mine ? '#fff' : colors.ink} style={{ lineHeight: 26 }}>{m.text}</T>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 6 }}>
          <T size={11} color={colors.faint}>{formatTime(m.createdAt, lang)}</T>
          {mine && (
            <Ionicons
              name={m.readAt ? 'checkmark-done' : 'checkmark'}
              size={14}
              color={m.readAt ? colors.readTick : colors.faint}
            />
          )}
        </View>
        {flaggedForSpecialist && (
          <View style={{
            maxWidth: '78%', marginTop: 4, backgroundColor: colors.dangerBg,
            borderRadius: 10, padding: 10, gap: 3,
          }}>
            <T w="700" size={12} color={colors.dangerDark}>{t('chat.flaggedMessage')}</T>
            <T size={11.5} color={colors.dangerDark} style={{ lineHeight: 18 }}>{t('chat.protocolReminder')}</T>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bgChat }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
        paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        {onBack ? <BackButton onPress={onBack} /> : null}
        <Avatar name={partner?.name} size={44} color={[colors.primary, '#fff']} online={partner?.online} />
        <View style={{ flex: 1, gap: 1 }}>
          <T w="700" size={16}>{partner?.name}</T>
          <T size={12.5} w="500" color={partnerTyping || partner?.online ? colors.success : colors.faint}>
            {partnerTyping
              ? t('chat.typing')
              : `${t(partner?.online ? 'chat.onlineNow' : 'chat.offline')}${partner?.role === 'specialist' ? ` · ${t('chat.specialistTitle')}` : ''}`}
          </T>
        </View>
        <TouchableOpacity
          onPress={() => setShowPropose(true)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="calendar-outline" size={19} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => partner && useCall.getState().startCall(conversationId, partner, 'video')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="videocam-outline" size={19} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => partner && useCall.getState().startCall(conversationId, partner)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="call-outline" size={19} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Patient risk banner */}
      {showRiskBanner && (
        <View style={{
          margin: 12, marginBottom: 0, backgroundColor: colors.card, borderRadius: 14, padding: 14,
          borderWidth: 1.5, borderColor: colors.dangerBorder, gap: 6,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="heart" size={17} color={colors.dangerDark} />
            <T w="700" size={14} color={colors.dangerDark}>{t('chat.riskBannerTitle')}</T>
            <TouchableOpacity style={{ marginStart: 'auto' }} onPress={() => setShowRiskBanner(false)}>
              <Ionicons name="close" size={17} color={colors.faint} />
            </TouchableOpacity>
          </View>
          <T size={12.5} color={colors.body} style={{ lineHeight: 20 }}>{t('chat.riskBannerBody')}</T>
          <TouchableOpacity onPress={() => navigation?.navigate('Crisis')}>
            <T w="600" size={13} color={colors.dangerDark}>{t('chat.riskBannerCta')}</T>
          </TouchableOpacity>
        </View>
      )}

      {/* Next session banner */}
      {nextAppointment && (
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
          <AppointmentCard appointment={nextAppointment} partnerName={partner?.name} />
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Composer / recording bar */}
      {recording ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
          paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <TouchableOpacity
            onPress={() => finishRecording(true)}
            style={{
              width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.primary,
            }}
          >
            <Ionicons
              name="send" size={18} color="#fff"
              style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}
            />
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
            <T w="700" size={15}>{mmss(recordMs / 1000)}</T>
            <T size={12.5} color={colors.faint}>{t('chat.recording')}</T>
          </View>
          <TouchableOpacity onPress={() => finishRecording(false)} style={{ padding: 8 }}>
            <Ionicons name="trash-outline" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card,
          paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <TouchableOpacity
            onPress={submit}
            disabled={!text.trim()}
            style={{
              width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
              backgroundColor: text.trim() ? colors.primary : colors.track,
            }}
          >
            <Ionicons
              name="send" size={18} color="#fff"
              style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}
            />
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder={t('chat.typePlaceholder')}
            placeholderTextColor={colors.faint}
            multiline
            style={{
              flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 23, backgroundColor: colors.bgChat,
              paddingHorizontal: 18, paddingVertical: 11, fontSize: 14.5, color: colors.ink,
              fontFamily: 'IBMPlexSansArabic_400Regular',
              textAlign: I18nManager.isRTL ? 'right' : 'left',
            }}
          />
          <TouchableOpacity onPress={startRecording} disabled={sendVoice.isPending} style={{ padding: 4 }}>
            <Ionicons
              name="mic-outline" size={24}
              color={sendVoice.isPending ? colors.faint : colors.muted}
            />
          </TouchableOpacity>
        </View>
      )}

      <ProposeSessionModal
        visible={showPropose}
        onClose={() => setShowPropose(false)}
        conversationId={conversationId}
      />
    </KeyboardAvoidingView>
  );
}
