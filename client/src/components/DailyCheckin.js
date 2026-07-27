import React, { useState } from 'react';
import { View, Modal, ScrollView, TouchableOpacity, TextInput, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { Screen, T, Card, Button } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { api } from '../api/client';
import { localizeDigits } from '../utils/format';
import { isMilestone, journeyFor } from '../utils/milestones';
import { PopIn, Pulse } from './motion';
import { tap as hapticTap, success as hapticSuccess, celebrate as hapticCelebrate } from '../utils/haptics';

// Daily check-in: mood/stress/energy/sleep on a 1-5 tap scale + optional
// journal note. The card renders on HomeScreen and hides itself once today's
// entry exists; the server answers with a supportive line + an exercise
// suggestion (rule-based — no AI latency here).

const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

function Scale({ label, value, onChange, lang }) {
  return (
    <View style={{ gap: 8 }}>
      <T w="600" size={14}>{label}</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => { hapticTap(); onChange(n); }}
            style={{
              flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
              backgroundColor: value === n ? colors.primary : '#fff',
              borderWidth: value === n ? 0 : 1.5, borderColor: colors.border,
            }}
          >
            <T w="700" size={15} color={value === n ? '#fff' : colors.muted}>{localizeDigits(n, lang)}</T>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function DailyCheckin() {
  const { t, lang, L } = useI18n();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ mood: 3, stress: 3, energy: 3, sleep: 3 });
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null); // { message, suggestion, milestone? }

  const { data } = useQuery({ queryKey: ['checkins'], queryFn: () => api('/ai/checkins') });

  const save = useMutation({
    mutationFn: () => api('/ai/checkin', { method: 'POST', body: { ...values, note: note.trim() || undefined } }),
    onSuccess: ({ feedback, total }) => {
      // The server sends the post-insert total, so a milestone is celebrated
      // in this same screen rather than a refetch later.
      const milestone = isMilestone(total) ? journeyFor(total).reached : null;
      setResult({ ...feedback, milestone });
      // A milestone gets the two-beat pattern; an ordinary save gets one.
      if (milestone) hapticCelebrate();
      else hapticSuccess();
      queryClient.invalidateQueries({ queryKey: ['checkins'] });
    },
  });

  const doneToday = isToday(data?.entries?.[0]?.createdAt);
  if (doneToday && !open) return null;

  const close = () => {
    setOpen(false);
    setResult(null);
    setNote('');
    setValues({ mood: 3, stress: 3, energy: 3, sleep: 3 });
  };

  const openSuggestion = (s) => {
    close();
    if (s.screen === 'Breathing') navigation.navigate('Breathing');
    else if (s.contentId) navigation.navigate('Article', { id: s.contentId });
  };

  return (
    <>
      {/* Home card */}
      <Card style={{ padding: 18, gap: 8 }} onPress={() => setOpen(true)}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="happy-outline" size={22} color={colors.primary} />
          <T w="700" size={16}>{t('companion.checkinCard')}</T>
        </View>
        <T size={13.5} color={colors.muted} style={{ lineHeight: 22 }}>{t('companion.checkinCardBody')}</T>
        <T w="600" size={14} color={colors.primary}>{t('companion.checkinStart')}</T>
      </Card>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <Screen edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T w="700" size={22}>{t('companion.checkinTitle')}</T>
              <TouchableOpacity onPress={close}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>

            {result ? (
              // Post-save: supportive line + optional exercise suggestion.
              <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
                <View style={{ alignItems: 'center', gap: 12 }}>
                  <Ionicons name="checkmark-circle" size={52} color={colors.success} />
                  <T w="700" size={17}>{t('companion.checkinThanks')}</T>
                  <T size={14} color={colors.body} style={{ textAlign: 'center', lineHeight: 24 }}>
                    {result.message}
                  </T>
                </View>
                {result.milestone && (
                  <PopIn delay={120}>
                    <Card style={{
                      padding: 16, gap: 8, alignItems: 'center',
                      backgroundColor: colors.successBg, borderColor: colors.successBg,
                    }}>
                      {/* Pulse sits behind the icon and stops after 3 beats —
                          a permanent loop on this screen would be agitating. */}
                      <View style={{ alignItems: 'center', justifyContent: 'center', height: 44 }}>
                        <Pulse size={54} color={colors.success} />
                        <Ionicons name={result.milestone.icon} size={30} color={colors.success} />
                      </View>
                      <T w="700" size={15} color={colors.success}>{t('journey.celebrate')}</T>
                      <T size={13.5} color={colors.body} style={{ textAlign: 'center', lineHeight: 21 }}>
                        {t(`journey.milestone.${result.milestone.at}`)}
                      </T>
                    </Card>
                  </PopIn>
                )}

                {result.suggestion && (
                  <Card
                    onPress={() => openSuggestion(result.suggestion)}
                    style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <View style={{
                      width: 38, height: 38, borderRadius: 11, backgroundColor: colors.bgSoft,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name="fitness-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T size={11.5} w="600" color={colors.faint}>{t('companion.suggestedExercise')}</T>
                      <T w="600" size={13.5}>{L(result.suggestion.title)}</T>
                    </View>
                    <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={15} color={colors.faint} />
                  </Card>
                )}
                <Button title={t('common.ok')} onPress={close} />
              </View>
            ) : (
              <>
                <Scale label={t('companion.mood')} lang={lang} value={values.mood} onChange={(mood) => setValues({ ...values, mood })} />
                <Scale label={t('companion.stress')} lang={lang} value={values.stress} onChange={(stress) => setValues({ ...values, stress })} />
                <Scale label={t('companion.energy')} lang={lang} value={values.energy} onChange={(energy) => setValues({ ...values, energy })} />
                <Scale label={t('companion.sleepQ')} lang={lang} value={values.sleep} onChange={(sleep) => setValues({ ...values, sleep })} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T size={11.5} color={colors.faint}>{t('companion.scaleLow')}</T>
                  <T size={11.5} color={colors.faint}>{t('companion.scaleHigh')}</T>
                </View>

                <View style={{ gap: 7 }}>
                  <T w="600" size={14}>{t('companion.noteLabel')}</T>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('companion.notePlaceholder')}
                    placeholderTextColor={colors.faint}
                    multiline
                    style={{
                      height: 110, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1.5,
                      borderColor: colors.inputBorder, padding: 14, textAlignVertical: 'top',
                      fontSize: 14, color: colors.ink, fontFamily: 'IBMPlexSansArabic_400Regular',
                      textAlign: I18nManager.isRTL ? 'right' : 'left',
                    }}
                  />
                </View>

                <View style={{ marginTop: 'auto' }}>
                  <Button title={t('companion.checkinSave')} onPress={() => save.mutate()} loading={save.isPending} />
                </View>
              </>
            )}
          </ScrollView>
        </Screen>
      </Modal>
    </>
  );
}
