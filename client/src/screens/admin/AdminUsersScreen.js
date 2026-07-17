import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, Badge, Chip, LoadingView, ErrorView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { formatDate } from '../../utils/format';

const ROLES = ['all', 'patient', 'specialist', 'admin'];

export default function AdminUsersScreen() {
  const { t, lang } = useI18n();
  const [role, setRole] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => api('/admin/users'),
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const users = (data.users || []).filter((u) => role === 'all' || u.role === role);

  const statusBadgeFor = (u) => {
    if (u.role !== 'specialist') return null;
    const map = {
      approved: { fg: colors.success, bg: colors.successBg },
      pending: { fg: colors.warn, bg: colors.warnBg },
      rejected: { fg: colors.dangerDark, bg: colors.dangerBg },
    };
    const c = map[u.status] || map.pending;
    return <Badge label={t(`admin.specialistStatus.${u.status}`)} fg={c.fg} bg={c.bg} />;
  };

  return (
    <Screen>
      <View style={{ padding: 22, paddingBottom: 12, gap: 14 }}>
        <T w="700" size={22}>{t('admin.usersTitle')}</T>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {ROLES.map((r) => (
            <Chip
              key={r}
              label={r === 'all' ? t('specialist.filterAll') : t(`admin.roleLabels.${r}`)}
              active={role === r}
              onPress={() => setRole(r)}
            />
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 22, gap: 10 }}>
        {users.map((u) => (
          <Card key={u.id} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={u.name} size={46} />
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <T w="700" size={15}>{u.name}</T>
              <T size={12} color={colors.muted} numberOfLines={1}>
                {u.email} · {formatDate(u.createdAt, lang)}
              </T>
            </View>
            {statusBadgeFor(u) || (
              <Badge label={t(`admin.roleLabels.${u.role}`)} fg={colors.primaryDark} bg={colors.bgSoft} />
            )}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
