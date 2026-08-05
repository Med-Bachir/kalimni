import React from 'react';
import { View, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { T, Card, Button } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { formatDateTime, localizeDigits } from '../utils/format';

// Self-contained session card: renders an appointment with the right actions
// for the viewer (invitee confirms/declines a proposal; either party cancels a
// proposed/confirmed one) and handles its own mutations. Reused in chat, home,
// and the specialist patient file.
//
// For a patient it also carries the Session Witness entry points (Phase 2.3):
// prepare a note before a confirmed session, record one line after it. Both
// hang off the appointment because that is when they are worth doing — the
// prep question is only answerable with a date in view.
export default function AppointmentCard({ appointment, partnerName, compact }) {
  const { t, lang } = useI18n();
  const navigation = useNavigation();
  const user = useAuth((s) => s.user);
  const userId = user?.id;
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['patients'] });
  };

  const respond = useMutation({
    mutationFn: (action) => api(`/appointments/${appointment.id}/respond`, { method: 'POST', body: { action } }),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: () => api(`/appointments/${appointment.id}/cancel`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const isProposer = appointment.proposedBy === userId;
  const proposed = appointment.status === 'proposed';
  const confirmed = appointment.status === 'confirmed';
  const isPatient = user?.role === 'patient';
  // "Past" starts when the slot ends, not when it starts: a session running
  // long should not flip the card to the after-question mid-conversation.
  const isPast =
    Date.now() > new Date(appointment.scheduledAt).getTime() + (appointment.durationMin || 45) * 60_000;

  const confirmCancel = () => {
    Alert.alert(t('appointments.cancelConfirm'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('appointments.cancel'), style: 'destructive', onPress: () => cancel.mutate() },
    ]);
  };

  const accent = confirmed ? colors.success : colors.warn;
  const statusLabel = confirmed ? t('appointments.statusConfirmed') : t('appointments.statusProposed');

  return (
    <Card style={{ padding: 14, gap: 12, borderColor: confirmed ? colors.successBg : colors.warnBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bgSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={appointment.mode === 'chat' ? 'chatbubble-ellipses-outline' : 'call-outline'} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T w="700" size={14.5}>{formatDateTime(appointment.scheduledAt, lang)}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
            <T size={12} color={colors.muted}>
              {statusLabel} · {t('appointments.minutesN', { n: localizeDigits(appointment.durationMin, lang) })}
            </T>
          </View>
        </View>
      </View>

      {appointment.note ? (
        <T size={12.5} color={colors.body} style={{ lineHeight: 20 }}>{appointment.note}</T>
      ) : null}

      {!compact && proposed && !isProposer && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={t('appointments.confirm')} style={{ flex: 1, height: 44 }}
            onPress={() => respond.mutate('confirm')} loading={respond.isPending && respond.variables === 'confirm'} />
          <Button title={t('appointments.decline')} variant="light" style={{ flex: 1, height: 44 }}
            onPress={() => respond.mutate('decline')} loading={respond.isPending && respond.variables === 'decline'} />
        </View>
      )}

      {!compact && proposed && isProposer && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={12.5} color={colors.muted}>{t('appointments.proposedByYou')}</T>
          <TouchableOpacity onPress={confirmCancel}>
            <T w="600" size={13} color={colors.dangerDark}>{t('appointments.cancel')}</T>
          </TouchableOpacity>
        </View>
      )}

      {!compact && confirmed && (
        <TouchableOpacity onPress={confirmCancel} style={{ alignSelf: 'flex-start' }}>
          <T w="600" size={13} color={colors.dangerDark}>{t('appointments.cancel')}</T>
        </TouchableOpacity>
      )}

      {/* Session Witness (Phase 2.3), patients only. Before a confirmed
          session: the note they write and choose to send. After it has
          passed: the one line they take away. Never both at once, and never
          for the specialist — the brief is the patient's to author. */}
      {!compact && isPatient && confirmed && (
        <TouchableOpacity
          onPress={() => navigation.navigate(
            isPast ? 'SessionTakeaway' : 'SessionPrep',
            { appointmentId: appointment.id }
          )}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.bgSoft, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 12,
          }}
        >
          <Ionicons
            name={isPast ? 'return-down-back-outline' : 'create-outline'}
            size={17}
            color={colors.primary}
          />
          <T w="600" size={13} color={colors.primary} style={{ flex: 1 }}>
            {t(isPast ? 'witness.takeawayCta' : 'witness.prepCta')}
          </T>
          <Ionicons name="chevron-forward" size={15} color={colors.faint} />
        </TouchableOpacity>
      )}
    </Card>
  );
}
