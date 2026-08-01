import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, Badge, Button, SectionHeader, LoadingView, ErrorView } from '../../components/ui';
import AckAlertModal from '../../components/AckAlertModal';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';
import { api } from '../../api/client';
import { localizeDigits, formatDate } from '../../utils/format';

export const statusBadge = (status, t) =>
  ({
    new: { label: t('admin.statusNew'), fg: colors.primary, bg: '#E3EFF4' },
    review: { label: t('admin.statusReview'), fg: colors.warn, bg: colors.warnBg },
    accepted: { label: t('admin.statusAccepted'), fg: colors.success, bg: colors.successBg },
    rejected: { label: t('admin.statusRejected'), fg: colors.dangerDark, bg: colors.dangerBg },
  })[status] || { label: status, fg: colors.muted, bg: colors.bgSoft };

export default function AdminDashboardScreen({ navigation }) {
  const { t, lang } = useI18n();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const stats = useQuery({ queryKey: ['adminStats'], queryFn: () => api('/admin/stats') });
  const requests = useQuery({ queryKey: ['adminRequests'], queryFn: () => api('/admin/requests') });
  // Alerts that sat unacknowledged for 60+ minutes (escalation tier 2). The
  // banner below cannot be dismissed — it leaves when the alert is
  // acknowledged with a recorded action, not before. Polled as a backstop for
  // the safety:critical socket event.
  const critical = useQuery({
    queryKey: ['criticalAlerts'],
    queryFn: () => api('/safety/alerts/critical'),
    refetchInterval: 60_000,
  });
  const [ackAlert, setAckAlert] = useState(null);

  if (stats.isLoading || requests.isLoading) return <LoadingView />;
  if (stats.isError || requests.isError) {
    return <ErrorView onRetry={() => { stats.refetch(); requests.refetch(); }} />;
  }

  const s = stats.data;
  const latest = (requests.data.requests || []).slice(0, 4);
  const n = (v) => localizeDigits(v, lang);

  const criticalAlerts = critical.data?.alerts || [];

  return (
    <Screen>
      {/* CRITICAL: crisis alerts unattended for over an hour. Pinned above
          everything, no dismiss control — acknowledging (with the action
          taken) is the only way it leaves the screen. */}
      {criticalAlerts.length > 0 && (
        <View style={{
          margin: 16, marginBottom: 0, backgroundColor: colors.dangerBg, borderRadius: 16,
          borderWidth: 2, borderColor: colors.dangerDark, padding: 14, gap: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="alert-circle" size={22} color={colors.dangerDark} />
            <T w="700" size={15} color={colors.dangerDark}>{t('admin.criticalTitle')}</T>
          </View>
          <T size={12.5} color={colors.dangerDark} style={{ lineHeight: 19 }}>{t('admin.criticalBody')}</T>
          {criticalAlerts.map((a) => (
            <View key={a.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card,
              borderRadius: 12, padding: 12,
            }}>
              <Avatar name={a.patient?.name} size={40} />
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <T w="700" size={14}>{a.patient?.name}</T>
                <T size={11.5} color={colors.muted}>{formatDate(a.createdAt, lang)}</T>
              </View>
              <Button
                title={t('specialist.ackAlert')} variant="danger" style={{ height: 40, paddingHorizontal: 14 }}
                onPress={() => setAckAlert(a)}
              />
            </View>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <T size={14} color={colors.muted}>{t('admin.role')}</T>
            <T w="700" size={22}>{t('admin.dashboard')}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={logout}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="log-out-outline" size={19} color={colors.dangerDark} />
            </TouchableOpacity>
            <Avatar name={user.name} color={[colors.ink, '#fff']} />
          </View>
        </View>

        {/* Stat tiles */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1, padding: 16, gap: 5 }} onPress={() => navigation.navigate('AdminUnassigned')}>
            <T size={12.5} color={colors.muted}>{t('admin.patientsCount')}</T>
            <T w="700" size={26}>{n(s.patients)}</T>
            <T w="600" size={11.5} color={s.unassignedPatients > 0 ? colors.warn : colors.success}>
              {s.unassignedPatients > 0
                ? t('admin.unassignedCount', { n: n(s.unassignedPatients) })
                : t('admin.weekPlus', { n: n(s.patientsThisWeek) })}
            </T>
          </Card>
          <Card style={{ flex: 1, padding: 16, gap: 5 }} onPress={() => navigation.navigate('AdminApprovals')}>
            <T size={12.5} color={colors.muted}>{t('admin.specialistsCount')}</T>
            <T w="700" size={26}>{n(s.specialists)}</T>
            <T w="600" size={11.5} color={colors.warn}>{t('admin.awaitingApproval', { n: n(s.pendingSpecialists) })}</T>
          </Card>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Requests')}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ gap: 4 }}>
              <T size={12.5} color="rgba(255,255,255,.75)">{t('admin.activeRequests')}</T>
              <T w="700" size={26} color="#fff">{n(s.activeRequests)}</T>
            </View>
            <View style={{ backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 }}>
              <T w="700" size={12} color={colors.primaryDark}>{t('admin.newToday', { n: n(s.newRequestsToday) })}</T>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {s.openSafetyAlerts > 0 && (
          <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: colors.dangerBorder, backgroundColor: '#FFF9F8' }}>
            <Ionicons name="warning" size={20} color={colors.dangerDark} />
            <T w="600" size={13.5} color={colors.dangerDark}>
              {t('admin.safetyOpen', { n: n(s.openSafetyAlerts) })}
            </T>
          </Card>
        )}

        {/* Latest requests */}
        <View style={{ gap: 12 }}>
          <SectionHeader
            title={t('admin.latestRequests')} actionLabel={t('common.viewAll')}
            onAction={() => navigation.navigate('Requests')}
          />
          <View style={{ gap: 10 }}>
            {latest.map((r) => {
              const badge = statusBadge(r.status, t);
              return (
                <Card key={r.id} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
                </Card>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <AckAlertModal alert={ackAlert} visible={!!ackAlert} onClose={() => setAckAlert(null)} />
    </Screen>
  );
}
