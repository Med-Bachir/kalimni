import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, Chip, Avatar, Badge, CountBadge, LoadingView, ErrorView, EmptyState } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';
import { api } from '../../api/client';
import { formatWhen, localizeDigits } from '../../utils/format';

export default function PatientsScreen({ navigation }) {
  const { t, lang, L } = useI18n();
  const user = useAuth((s) => s.user);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api('/specialist/patients'),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const all = data.patients || [];
  const withMessages = all.filter((p) => p.unreadCount > 0);
  const newCases = all.filter((p) => p.isNewCase);
  const needle = search.trim().toLowerCase();

  let patients = filter === 'messages' ? withMessages : filter === 'new' ? newCases : all;
  if (needle) patients = patients.filter((p) => p.name.toLowerCase().includes(needle));

  return (
    <Screen>
      <View style={{ padding: 22, paddingBottom: 0, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <T size={14} color={colors.muted}>{user.name}</T>
            <T w="700" size={22}>{t('specialist.patientsTitle')}</T>
          </View>
          <Avatar name={user.name} color={[colors.primary, '#fff']} />
        </View>

        <View style={{
          height: 50, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1.5,
          borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
        }}>
          <Ionicons name="search" size={20} color={colors.faint} />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder={t('specialist.searchPlaceholder')} placeholderTextColor={colors.faint}
            style={{
              flex: 1, fontSize: 14.5, color: colors.ink, fontFamily: 'IBMPlexSansArabic_400Regular',
              textAlign: I18nManager.isRTL ? 'right' : 'left',
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip label={t('specialist.filterAll')} badge={localizeDigits(all.length, lang)} active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={t('specialist.filterNewMessages')} badge={localizeDigits(withMessages.length, lang)} active={filter === 'messages'} onPress={() => setFilter('messages')} />
          <Chip label={t('specialist.filterNewCases')} badge={localizeDigits(newCases.length, lang)} active={filter === 'new'} onPress={() => setFilter('new')} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 22, gap: 10 }} showsVerticalScrollIndicator={false}>
        {patients.length === 0 ? (
          <EmptyState icon="people-outline" title={t('specialist.empty')} />
        ) : (
          patients.map((p) => (
            <Card
              key={p.id}
              onPress={() => navigation.navigate('PatientDetail', { patientId: p.id, patient: p })}
              style={{ padding: 14, flexDirection: 'row', gap: 13, alignItems: 'center', borderRadius: 17 }}
            >
              <Avatar name={p.name} size={52} online={p.online} />
              <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T w="700" size={15.5}>{p.name}</T>
                  {p.lastMessage ? (
                    <T size={11.5} color={colors.faint}>{formatWhen(p.lastMessage.createdAt, lang, t)}</T>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <T size={13} color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>
                    {p.lastMessage
                      ? p.lastMessage.text
                      : p.latestResult
                        ? t('specialist.completedIntake', { label: L(p.latestResult.label) })
                        : t('specialist.noMessages')}
                  </T>
                  {p.openAlerts > 0 ? (
                    <Ionicons name="warning" size={17} color={colors.danger} />
                  ) : null}
                  {p.unreadCount > 0 ? (
                    <CountBadge count={localizeDigits(p.unreadCount, lang)} />
                  ) : p.isNewCase ? (
                    <Badge label={t('specialist.newCase')} fg={colors.warn} bg={colors.warnBg} />
                  ) : null}
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
