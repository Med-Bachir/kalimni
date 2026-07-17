import React from 'react';
import { View, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, Button, BackButton, LoadingView, ErrorView, EmptyState } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';

// Specialist approval queue: verify diplomas/licenses manually, then approve.
export default function AdminApprovalsScreen({ navigation }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pendingSpecialists'],
    queryFn: () => api('/admin/specialists/pending'),
  });

  const act = useMutation({
    mutationFn: ({ id, action }) => api(`/admin/specialists/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingSpecialists'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminSpecialists'] });
    },
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const pending = data.specialists || [];

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('admin.approvalsTitle')}</T>
        </View>

        {pending.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title={t('admin.noPending')} />
        ) : (
          pending.map((sp) => (
            <Card key={sp.id} style={{ padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={sp.name} size={52} color={[colors.primary, '#fff']} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T w="700" size={15.5}>{sp.name}</T>
                  <T size={12.5} color={colors.muted}>{sp.email}</T>
                  {sp.license ? (
                    <T size={12} color={colors.faint}>{t('admin.license', { license: sp.license })}</T>
                  ) : null}
                </View>
              </View>
              {sp.bio ? (
                <T size={13.5} color={colors.body} style={{ lineHeight: 23 }}>{sp.bio}</T>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  title={t('admin.approve')} style={{ flex: 1, height: 46 }}
                  onPress={() => act.mutate({ id: sp.id, action: 'approve' })}
                  loading={act.isPending && act.variables?.id === sp.id && act.variables?.action === 'approve'}
                />
                <Button
                  title={t('admin.reject')} variant="danger" style={{ flex: 1, height: 46 }}
                  onPress={() => act.mutate({ id: sp.id, action: 'reject' })}
                  loading={act.isPending && act.variables?.id === sp.id && act.variables?.action === 'reject'}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
