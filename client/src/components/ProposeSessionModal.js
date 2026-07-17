import React, { useMemo, useState } from 'react';
import { View, ScrollView, Modal, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { T, Button, Chip, Input } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { api, ApiError } from '../api/client';
import { formatDayShort, localizeDigits } from '../utils/format';

// Slot-based scheduler (no native date picker → works in Expo Go, RTL-safe):
// pick a day from the next two weeks, an hour slot, duration and mode.
const DAYS_AHEAD = 14;
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const DURATIONS = [30, 45, 60];

export default function ProposeSessionModal({ visible, onClose, conversationId }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();

  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);
      out.push(d);
    }
    return out;
  }, []);

  const [dayIndex, setDayIndex] = useState(0);
  const [hour, setHour] = useState(16);
  const [duration, setDuration] = useState(45);
  const [mode, setMode] = useState('call');
  const [note, setNote] = useState('');

  const scheduledAt = useMemo(() => {
    const d = new Date(days[dayIndex]);
    d.setHours(hour, 0, 0, 0);
    return d;
  }, [days, dayIndex, hour]);

  const isPast = scheduledAt.getTime() < Date.now();

  const propose = useMutation({
    mutationFn: () =>
      api('/appointments', {
        method: 'POST',
        body: {
          conversationId,
          scheduledAt: scheduledAt.toISOString(),
          durationMin: duration,
          mode,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      reset();
      onClose();
    },
    onError: (e) => {
      Alert.alert(
        t('common.errorTitle'),
        e instanceof ApiError && e.code === 'appointment_exists'
          ? t('appointments.exists')
          : t('common.networkError')
      );
    },
  });

  const reset = () => {
    setDayIndex(0);
    setHour(16);
    setDuration(45);
    setMode('call');
    setNote('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const ampm = (h) => localizeDigits(`${String(h).padStart(2, '0')}:00`, lang);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,49,63,.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 18, maxHeight: '86%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T w="700" size={18}>{t('appointments.modalTitle')}</T>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ gap: 18 }} showsVerticalScrollIndicator={false}>
            {/* Day */}
            <View style={{ gap: 10 }}>
              <T w="600" size={14}>{t('appointments.pickDay')}</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {days.map((d, i) => (
                  <Chip key={i} label={formatDayShort(d, lang)} active={dayIndex === i} onPress={() => setDayIndex(i)} />
                ))}
              </ScrollView>
            </View>

            {/* Time */}
            <View style={{ gap: 10 }}>
              <T w="600" size={14}>{t('appointments.pickTime')}</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {HOURS.map((h) => (
                  <Chip key={h} label={ampm(h)} active={hour === h} onPress={() => setHour(h)} />
                ))}
              </ScrollView>
            </View>

            {/* Duration */}
            <View style={{ gap: 10 }}>
              <T w="600" size={14}>{t('appointments.duration')}</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {DURATIONS.map((d) => (
                  <Chip key={d} label={t('appointments.minutesN', { n: localizeDigits(d, lang) })} active={duration === d} onPress={() => setDuration(d)} />
                ))}
              </View>
            </View>

            {/* Mode */}
            <View style={{ gap: 10 }}>
              <T w="600" size={14}>{t('appointments.mode')}</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label={t('appointments.modeCall')} active={mode === 'call'} onPress={() => setMode('call')} />
                <Chip label={t('appointments.modeChat')} active={mode === 'chat'} onPress={() => setMode('chat')} />
              </View>
            </View>

            <Input
              label={t('appointments.noteOptional')} value={note} onChangeText={setNote}
              placeholder={t('appointments.notePlaceholder')} maxLength={200}
            />
          </ScrollView>

          <Button
            title={t('appointments.send')} onPress={() => propose.mutate()}
            loading={propose.isPending} disabled={isPast}
          />
        </View>
      </View>
    </Modal>
  );
}
