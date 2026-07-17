import React, { useState } from 'react';
import { View, ScrollView, Modal, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, Badge, Chip, Button, LevelBadge, LoadingView, ErrorView, EmptyState } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { localizeDigits } from '../../utils/format';
import { statusBadge } from './AdminDashboardScreen';

const FILTERS = ['all', 'new', 'review', 'accepted', 'rejected'];

export default function AdminRequestsScreen() {
  const { t, lang, L } = useI18n();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [assigning, setAssigning] = useState(null); // request being assigned

  const requests = useQuery({ queryKey: ['adminRequests'], queryFn: () => api('/admin/requests') });
  const specialists = useQuery({
    queryKey: ['adminSpecialists'],
    queryFn: () => api('/admin/users?role=specialist'),
  });

  const act = useMutation({
    mutationFn: ({ id, body }) => api(`/admin/requests/${id}`, { method: 'POST', body }),
    onSuccess: () => {
      setAssigning(null);
      queryClient.invalidateQueries({ queryKey: ['adminRequests'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
  });

  if (requests.isLoading) return <LoadingView />;
  if (requests.isError) return <ErrorView onRetry={requests.refetch} />;

  const list = (requests.data.requests || []).filter((r) => filter === 'all' || r.status === filter);
  const approvedSpecialists = (specialists.data?.users || []).filter((u) => u.status === 'approved');

  const filterLabel = (f) =>
    f === 'all' ? t('specialist.filterAll') : statusBadge(f, t).label;

  return (
    <Screen>
      <View style={{ padding: 22, paddingBottom: 12, gap: 14 }}>
        <T w="700" size={22}>{t('admin.requestsTitle')}</T>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <Chip key={f} label={filterLabel(f)} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 22, gap: 10 }}>
        {list.length === 0 ? (
          <EmptyState icon="list-outline" title={t('library.empty')} />
        ) : (
          list.map((r) => {
            const badge = statusBadge(r.status, t);
            const open = ['new', 'review'].includes(r.status);
            return (
              <Card key={r.id} style={{ padding: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={r.patient?.name} size={46} />
                  <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                    <T w="700" size={15}>{r.patient?.name}</T>
                    <T size={12.5} color={colors.muted} numberOfLines={1}>
                      {t(r.type === 'reassign' ? 'admin.typeReassign' : 'admin.typeMatch')}
                      {' · '}
                      {r.assignedSpecialist?.name || r.requestedSpecialist?.name || t('admin.unassigned')}
                    </T>
                  </View>
                  <Badge label={badge.label} fg={badge.fg} bg={badge.bg} />
                </View>

                {r.context ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T size={12.5} color={colors.muted}>
                      {(r.context.questionnaireId || '').toUpperCase()} · {t('specialist.score', { score: localizeDigits(r.context.score, lang) })}
                    </T>
                  </View>
                ) : null}

                {open && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      title={t('admin.assign')} style={{ flex: 1.4, height: 44 }}
                      onPress={() => setAssigning(r)}
                    />
                    {r.status === 'new' && (
                      <Button
                        title={t('admin.markReview')} variant="light" style={{ flex: 1, height: 44 }}
                        onPress={() => act.mutate({ id: r.id, body: { action: 'review' } })}
                      />
                    )}
                    <Button
                      title={t('admin.reject')} variant="danger" style={{ flex: 0.8, height: 44 }}
                      onPress={() => act.mutate({ id: r.id, body: { action: 'reject' } })}
                    />
                  </View>
                )}
              </Card>
            );
          })
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
                  onPress={() => act.mutate({ id: assigning.id, body: { action: 'assign', specialistId: sp.id } })}
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
