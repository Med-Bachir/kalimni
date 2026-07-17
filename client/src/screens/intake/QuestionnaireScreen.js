import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Button, BackButton, LoadingView, ErrorView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { localizeDigits } from '../../utils/format';

// Runs one questionnaire (GAD-7 first, then PHQ-9). `retake: true` when
// launched from the profile after intake is already complete.
export default function QuestionnaireScreen({ navigation, route }) {
  const questionnaireId = route.params?.questionnaireId || 'gad7';
  const retake = !!route.params?.retake;
  const { t, lang, L } = useI18n();
  const refreshMe = useAuth((s) => s.refreshMe);
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => api('/questionnaires'),
  });

  const submit = useMutation({
    mutationFn: (finalAnswers) =>
      api(`/questionnaires/${questionnaireId}/submit`, { method: 'POST', body: { answers: finalAnswers } }),
    onSuccess: async ({ result }) => {
      await refreshMe();
      // New score -> trend chart and the Home check-in nudge must refresh.
      queryClient.invalidateQueries({ queryKey: ['history'] });
      navigation.replace('Result', { result, questionnaireId, retake });
    },
  });

  const skip = async () => {
    await api('/questionnaires/skip', { method: 'POST' }).catch(() => {});
    await refreshMe();
    navigation.reset({ index: 0, routes: [{ name: 'PatientTabs' }] });
  };

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const questionnaire = data.questionnaires.find((q) => q.id === questionnaireId);
  const items = questionnaire.items;
  const item = items[step];
  const selected = answers[item.id];

  const next = () => {
    if (step < items.length - 1) {
      setStep(step + 1);
    } else {
      submit.mutate(items.map((i) => answers[i.id]));
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
    else if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: 24, gap: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton onPress={back} />
          <T w="600" size={14} color={colors.muted}>
            {t('intake.questionOf', {
              n: localizeDigits(step + 1, lang),
              total: localizeDigits(items.length, lang),
            })}
          </T>
          {!retake ? (
            <TouchableOpacity onPress={skip}>
              <T w="600" size={14} color={colors.primary}>{t('common.skip')}</T>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {items.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: 6, borderRadius: 3,
                backgroundColor: i <= step ? colors.primary : colors.track,
              }}
            />
          ))}
        </View>

        <T w="700" size={23} style={{ lineHeight: 38, marginTop: 8 }}>{L(item.text)}</T>
        <T size={13} color={colors.faint} style={{ marginTop: -14 }}>{L(questionnaire.intro)}</T>

        <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
          {questionnaire.options.map((opt) => {
            const active = selected === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                activeOpacity={0.75}
                onPress={() => setAnswers({ ...answers, [item.id]: opt.value })}
                style={{
                  minHeight: 60, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: active ? colors.bgSoft : '#fff',
                  borderWidth: active ? 2 : 1.5,
                  borderColor: active ? colors.primary : colors.inputBorder,
                }}
              >
                <T w={active ? '600' : '500'} size={16} color={active ? colors.primaryDark : colors.ink}>
                  {L(opt.label)}
                </T>
                <View
                  style={{
                    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.card,
                    borderWidth: active ? 7 : 2,
                    borderColor: active ? colors.primary : '#C3D6E0',
                  }}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Button
          title={t('common.next')}
          onPress={next}
          disabled={selected === undefined}
          loading={submit.isPending}
        />
      </View>
    </Screen>
  );
}
