import React, { useState } from 'react';
import { View, ScrollView, Modal, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, Button, BackButton, LevelBadge, LoadingView, ErrorView, EmptyState } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { formatDate, localizeDigits } from '../../utils/format';

// Patients with no assigned specialist yet — direct assignment, no matching
// request required. Mirrors the picker flow in AdminRequestsScreen.
export default function AdminUnassignedScreen({ navigation }) {
  const { t, lang, L } = useI18n();
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState(null); // patient being assigned

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['unassignedPatients'],
    queryFn: () => api('/admin/patients/unassigned'),
  });
  const specialists = useQuery({
    queryKey: ['adminSpecialists'],
    queryFn: () => api('/admin/users?role=specialist'),
  });

  const assign = useMutation({
    mutationFn: ({ patientId, specialistId }) =>
      api(`/admin/patients/${patientId}/assign`, { method: 'POST', body: { specialistId } }),
    onSuccess: () => {
      setAssigning(null);
      queryClient.invalidateQueries({ queryKey: ['unassignedPatients'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminRequests'] });
    },
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const patients = data.patients || [];
  const approvedSpecialists = (specialists.data?.users || []).filter((u) => u.status === 'approved');

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('admin.unassignedTitle')}</T>
        </View>

        {patients.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title={t('admin.noUnassigned')} />
        ) : (
          patients.map((p) => (
            <Card key={p.id} style={{ padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={p.name} size={52} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <T w="700" size={15.5}>{p.name}</T>
                  <T size={12.5} color={colors.muted} numberOfLines={1}>{p.email}</T>
                  <T size={12} color={colors.faint}>
                    {t('admin.registeredOn', { date: formatDate(p.createdAt, lang) })}
                  </T>
                </View>
                {p.latestResult ? (
                  <LevelBadge label={L(p.latestResult.label)} level={p.latestResult.level} />
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
                  {p.latestResult
                    ? `${(p.latestResult.questionnaireId || '').toUpperCase()} · ${t('specialist.score', { score: localizeDigits(p.latestResult.score, lang) })}`
                    : t('admin.noIntake')}
                </T>
                <Button
                  title={t('admin.assign')} style={{ height: 42, paddingHorizontal: 18 }}
                  onPress={() => setAssigning(p)}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Specialist picker */}
      <Modal visible={!!assigning} transparent animationType="fade" onRequestClose={() => setAssigning(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(20,49,63,.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 14, maxHeight: '70%' }}>
            <T w="700" size={18}>{t('admin.chooseSpecialist')}</T>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {approvedSpecialists.map((sp) => (
                <TouchableOpacity
                  key={sp.id}
                  disabled={assign.isPending}
                  onPress={() => assign.mutate({ patientId: assigning.id, specialistId: sp.id })}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
                    borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
                  }}
                >
                  <Avatar name={sp.name} size={44} color={[colors.primary, '#fff']} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T w="600" size={15}>{sp.name}</T>
                    <T size={12} color={colors.muted}>{sp.license ? t('admin.license', { license: sp.license }) : t('chat.specialistTitle')}</T>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button title={t('common.cancel')} variant="light" onPress={() => setAssigning(null)} style={{ height: 48 }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
