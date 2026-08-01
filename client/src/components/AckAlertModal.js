import React, { useState } from 'react';
import { Modal, View, TextInput, I18nManager } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { T, Button } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { api } from '../api/client';

// Acknowledging a safety alert is a CLINICAL act, not a dismissal: the server
// refuses an ack without a recorded action (what the clinician actually did),
// and stores it in the append-only escalation audit. This modal is the single
// ack surface for specialists and admins.
export default function AckAlertModal({ alert, visible, onClose }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [tooShort, setTooShort] = useState(false);

  const ack = useMutation({
    mutationFn: () =>
      api(`/safety/alerts/${alert.id}/ack`, { method: 'POST', body: { actionTaken: text.trim() } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safetyAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['criticalAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setText('');
      onClose();
    },
    onError: (err) => {
      if (err?.code === 'action_taken_required') setTooShort(true);
    },
  });

  const submit = () => {
    if (text.trim().length < 5) return setTooShort(true);
    setTooShort(false);
    return ack.mutate();
  };

  if (!alert) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,30,35,.45)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 12 }}>
          <T w="700" size={17}>{t('safetyAck.title')}</T>
          <T size={13} color={colors.body} style={{ lineHeight: 20 }}>{t('safetyAck.hint')}</T>
          <TextInput
            value={text}
            onChangeText={(v) => { setText(v); setTooShort(false); }}
            placeholder={t('safetyAck.placeholder')}
            placeholderTextColor={colors.faint}
            multiline
            autoFocus
            style={{
              minHeight: 90, maxHeight: 160, borderRadius: 14, backgroundColor: colors.bgSoft,
              paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.ink,
              fontFamily: 'IBMPlexSansArabic_400Regular', textAlignVertical: 'top',
              textAlign: I18nManager.isRTL ? 'right' : 'left',
            }}
          />
          {tooShort && (
            <T size={12.5} color={colors.dangerDark}>{t('safetyAck.tooShort')}</T>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title={t('common.cancel')} variant="light" style={{ flex: 1, height: 46 }}
              onPress={() => { setText(''); setTooShort(false); onClose(); }}
            />
            <Button
              title={t('safetyAck.confirm')} variant="danger" style={{ flex: 1, height: 46 }}
              onPress={submit} loading={ack.isPending}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
