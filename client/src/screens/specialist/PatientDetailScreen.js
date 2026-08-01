import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, Badge, Button, BackButton, LevelBadge, LoadingView } from '../../components/ui';
import AppointmentCard from '../../components/AppointmentCard';
import ProposeSessionModal from '../../components/ProposeSessionModal';
import AckAlertModal from '../../components/AckAlertModal';
import MoodTrend from '../../components/MoodTrend';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { formatDate, localizeDigits } from '../../utils/format';

const CODES = { gad7: 'GAD-7', phq9: 'PHQ-9' };

// Patient file: intake history, open safety alerts, sessions, jump into chat.
export default function PatientDetailScreen({ navigation, route }) {
  const { patientId, patient } = route.params;
  const { t, lang, L } = useI18n();
  const queryClient = useQueryClient();
  const [showPropose, setShowPropose] = useState(false);

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['history', patientId],
    queryFn: () => api(`/questionnaires/history?patientId=${patientId}`),
  });
  const { data: alertsData } = useQuery({
    queryKey: ['safetyAlerts'],
    queryFn: () => api('/safety/alerts'),
  });
  const { data: apptData } = useQuery({
    queryKey: ['appointments', 'conversation', patient.conversationId],
    queryFn: () => api(`/appointments?conversationId=${patient.conversationId}`),
    enabled: !!patient.conversationId,
  });

  // Acknowledging requires recording the clinical action taken — the modal
  // collects it and the server refuses an empty ack (Phase 1.1).
  const [ackAlert, setAckAlert] = useState(null);

  // AI companion: daily check-ins + the per-patient enable/disable control.
  const { data: checkinData } = useQuery({
    queryKey: ['patientCheckins', patientId],
    queryFn: () => api(`/specialist/patients/${patientId}/checkins`),
  });
  const toggleAi = useMutation({
    mutationFn: (enabled) => api(`/specialist/patients/${patientId}/ai`, { method: 'PUT', body: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patientCheckins', patientId] }),
  });

  if (isLoading) return <LoadingView />;

  const results = historyData?.results || [];
  const openAlerts = (alertsData?.alerts || []).filter(
    (a) => a.patientId === patientId && a.status === 'open'
  );
  const nextAppointment = (apptData?.appointments || []).find((a) =>
    ['proposed', 'confirmed'].includes(a.status) && new Date(a.scheduledAt).getTime() > Date.now() - 3600_000
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('specialist.patientFile')}</T>
        </View>

        <Card style={{ padding: 22, alignItems: 'center', gap: 10, borderRadius: 20 }}>
          <Avatar name={patient.name} size={72} online={patient.online} />
          <T w="700" size={18}>{patient.name}</T>
          {patient.latestResult ? (
            <LevelBadge label={L(patient.latestResult.label)} level={patient.latestResult.level} />
          ) : null}
        </Card>

        {/* Safety alerts */}
        <View style={{ gap: 10 }}>
          <T w="700" size={17}>{t('specialist.safetyAlerts')}</T>
          {openAlerts.length === 0 ? (
            <Card style={{ padding: 14 }}>
              <T size={13.5} color={colors.muted}>{t('specialist.noAlerts')}</T>
            </Card>
          ) : (
            openAlerts.map((a) => (
              <Card key={a.id} style={{ padding: 14, gap: 10, borderColor: colors.dangerBorder, backgroundColor: '#FFF9F8' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="warning" size={18} color={colors.dangerDark} />
                  <T w="700" size={13.5} color={colors.dangerDark}>{t('chat.flaggedMessage')}</T>
                  {a.source === 'ai_chat' && <Badge label="AI" fg={colors.dangerDark} bg={colors.dangerBg} />}
                  <T size={11.5} color={colors.faint} style={{ marginStart: 'auto' }}>
                    {formatDate(a.createdAt, lang)}
                  </T>
                </View>
                {(a.message || a.detail?.trigger) ? (
                  <T size={13.5} color={colors.body} style={{ lineHeight: 22 }}>
                    "{a.message?.text || a.detail.trigger}"
                  </T>
                ) : null}
                <T size={12} color={colors.dangerDark} style={{ lineHeight: 19 }}>{t('chat.protocolReminder')}</T>
                <Button
                  title={t('specialist.ackAlert')} variant="danger" style={{ height: 44 }}
                  onPress={() => setAckAlert(a)}
                />
              </Card>
            ))
          )}
        </View>

        {/* Sessions */}
        {patient.conversationId && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T w="700" size={17}>{t('appointments.upcoming')}</T>
              {!nextAppointment && (
                <TouchableOpacity onPress={() => setShowPropose(true)}>
                  <T w="600" size={13} color={colors.primary}>{t('appointments.proposeShort')}</T>
                </TouchableOpacity>
              )}
            </View>
            {nextAppointment ? (
              <AppointmentCard appointment={nextAppointment} partnerName={patient.name} />
            ) : (
              <Card style={{ padding: 14 }}>
                <T size={13.5} color={colors.muted}>{t('appointments.none')}</T>
              </Card>
            )}
          </View>
        )}

        {/* AI companion: per-patient control + daily check-ins */}
        <View style={{ gap: 10 }}>
          <T w="700" size={17}>{t('companion.title')}</T>
          <Card style={{ padding: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T w="600" size={15}>{t('companion.specToggle')}</T>
              <Switch
                value={checkinData?.aiEnabled !== false}
                onValueChange={(v) => toggleAi.mutate(v)}
                disabled={toggleAi.isPending || !checkinData}
                trackColor={{ false: colors.track, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
            <T size={12} color={colors.faint} style={{ lineHeight: 18 }}>{t('companion.specToggleHint')}</T>
          </Card>

          <T w="600" size={14} color={colors.muted}>{t('companion.specCheckins')}</T>
          {(checkinData?.entries || []).length === 0 ? (
            <Card style={{ padding: 14 }}>
              <T size={13.5} color={colors.muted}>{t('companion.specNoCheckins')}</T>
            </Card>
          ) : (
            <>
              {/* Two weeks of shape first — scanning five rows of numbers
                  before a session doesn't show a pattern. Exact values and the
                  patient's own notes stay below it. */}
              <MoodTrend
                entries={checkinData.entries}
                title={t('trend.titlePatient')}
                audience="specialist"
              />
              {checkinData.entries.slice(0, 5).map((e) => (
              <Card key={e.id} style={{ padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <T size={12} color={colors.faint}>{formatDate(e.createdAt, lang)}</T>
                </View>
                <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
                  {[['mood', e.mood], ['stress', e.stress], ['energy', e.energy], ['sleepQ', e.sleep]].map(([key, v]) => (
                    <T key={key} size={12.5} color={colors.body}>
                      {t(`companion.${key}`)}: <T w="700" size={12.5}>{localizeDigits(v, lang)}/{localizeDigits(5, lang)}</T>
                    </T>
                  ))}
                </View>
                {e.note ? (
                  <T size={13} color={colors.body} style={{ lineHeight: 21 }}>"{e.note}"</T>
                ) : null}
              </Card>
              ))}
            </>
          )}
        </View>

        {/* Questionnaire history */}
        <View style={{ gap: 10 }}>
          <T w="700" size={17}>{t('specialist.intakeResults')}</T>
          {results.length === 0 ? (
            <Card style={{ padding: 14 }}>
              <T size={13.5} color={colors.muted}>{t('history.empty')}</T>
            </Card>
          ) : (
            results.map((r) => (
              <Card key={r.id} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <T w="700" size={14.5}>{CODES[r.questionnaireId] || r.questionnaireId}</T>
                  <T size={12} color={colors.muted}>
                    {t('specialist.score', { score: localizeDigits(r.score, lang) })} · {formatDate(r.createdAt, lang)}
                  </T>
                </View>
                <LevelBadge label={L(r.label)} level={r.level} />
              </Card>
            ))
          )}
        </View>

        {patient.conversationId ? (
          <Button
            title={t('specialist.openChat')} icon="chatbubble-ellipses-outline"
            onPress={() => navigation.navigate('Chat', { conversationId: patient.conversationId })}
          />
        ) : null}
      </ScrollView>

      {patient.conversationId && (
        <ProposeSessionModal
          visible={showPropose}
          onClose={() => setShowPropose(false)}
          conversationId={patient.conversationId}
        />
      )}

      <AckAlertModal alert={ackAlert} visible={!!ackAlert} onClose={() => setAckAlert(null)} />
    </Screen>
  );
}
