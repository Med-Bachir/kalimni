import React from 'react';
import { View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, BackButton, LoadingView, ErrorView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useSafetyPlan } from '../../store/safetyPlan';
import { localizeDigits } from '../../utils/format';

// Crisis / emergency screen: always reachable, works before login too.
//
// For a patient WITH a safety plan, the plan comes FIRST (Phase 2.1): a plan
// they wrote themselves while calm beats a helpline they have to decide to
// call. Emergency numbers stay right below it. Without a plan: numbers, plus
// a gentle invitation to write one — after the moment, not during it.

const PLAN_SECTIONS = ['warningSigns', 'copingAlone', 'distractions'];

function PlanLine({ text }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Ionicons name="ellipse" size={7} color={colors.primary} style={{ marginTop: 7 }} />
      <T size={14} style={{ flex: 1, lineHeight: 23 }}>{text}</T>
    </View>
  );
}

export default function CrisisScreen({ navigation }) {
  const { t, lang, L } = useI18n();
  const user = useAuth((s) => s.user);
  const plan = useSafetyPlan((s) => s.plan);
  const hasPlan = useSafetyPlan((s) => s.hasPlan)();
  const isPatient = user?.role === 'patient';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['safetyResources'],
    queryFn: () => api('/safety/resources'),
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const contacts = plan?.contacts || [];
  const professionals = plan?.professionals || [];

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('crisis.title')}</T>
        </View>

        {/* The patient's own plan, first. */}
        {isPatient && hasPlan && (
          <Card style={{ padding: 18, gap: 14, borderColor: colors.primary, borderWidth: 1.5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name="map-outline" size={20} color={colors.primary} />
              <T w="700" size={16} style={{ flex: 1 }}>{t('crisis.planTitle')}</T>
              <TouchableOpacity onPress={() => navigation.navigate('SafetyPlan')} hitSlop={8}>
                <T w="600" size={13} color={colors.primary}>{t('crisis.planEdit')}</T>
              </TouchableOpacity>
            </View>

            {PLAN_SECTIONS.map((section) =>
              plan[section]?.length ? (
                <View key={section} style={{ gap: 6 }}>
                  <T w="700" size={13} color={colors.muted}>{t(`safetyPlan.${section}`)}</T>
                  {plan[section].map((item, i) => <PlanLine key={`${section}-${i}`} text={item} />)}
                </View>
              ) : null
            )}

            {contacts.length > 0 && (
              <View style={{ gap: 8 }}>
                <T w="700" size={13} color={colors.muted}>{t('safetyPlan.contacts')}</T>
                {contacts.map((c, i) => (
                  <TouchableOpacity
                    key={`c-${i}`}
                    disabled={!c.phone}
                    onPress={() => c.phone && Linking.openURL(`tel:${c.phone}`)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: colors.bgSoft, borderRadius: 12, padding: 12,
                    }}
                  >
                    <Ionicons name="person" size={16} color={colors.primary} />
                    <T w="600" size={14} style={{ flex: 1 }}>{c.name}</T>
                    {c.phone ? (
                      <>
                        <Ionicons name="call" size={15} color={colors.success} />
                        <T w="700" size={14} color={colors.success}>{localizeDigits(c.phone, lang)}</T>
                      </>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {professionals.length > 0 && (
              <View style={{ gap: 8 }}>
                <T w="700" size={13} color={colors.muted}>{t('safetyPlan.professionals')}</T>
                {professionals.map((p, i) => (
                  <TouchableOpacity
                    key={`p-${i}`}
                    onPress={() => p.phone && Linking.openURL(`tel:${p.phone}`)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: colors.dangerBg, borderRadius: 12, padding: 12,
                    }}
                  >
                    <Ionicons name="call" size={16} color={colors.dangerDark} />
                    <T w="600" size={14} color={colors.dangerDark} style={{ flex: 1 }}>{p.name}</T>
                    {p.phone ? <T w="700" size={15} color={colors.dangerDark}>{localizeDigits(p.phone, lang)}</T> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Invitation to write the plan — only when there is none yet. */}
        {isPatient && !hasPlan && (
          <Card
            onPress={() => navigation.navigate('SafetyPlan')}
            style={{ padding: 16, gap: 8, borderColor: colors.primary, borderWidth: 1.5 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name="map-outline" size={20} color={colors.primary} />
              <T w="700" size={15}>{t('crisis.planCreateTitle')}</T>
            </View>
            <T size={13} color={colors.body} style={{ lineHeight: 21 }}>{t('crisis.planCreateBody')}</T>
            <T w="600" size={13.5} color={colors.primary}>{t('crisis.planCreateCta')}</T>
          </Card>
        )}

        <Card style={{ padding: 16, backgroundColor: '#FFF9F8', borderColor: colors.dangerBorder, flexDirection: 'row', gap: 12 }}>
          <Ionicons name="heart" size={22} color={colors.dangerDark} />
          <T size={14} color={colors.body} style={{ flex: 1, lineHeight: 24 }}>{L(data.disclaimer)}</T>
        </Card>

        <View style={{ gap: 10 }}>
          {data.resources.map((r) => (
            <Card key={r.id} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 48, height: 48, borderRadius: 14, backgroundColor: colors.dangerBg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="call" size={22} color={colors.dangerDark} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <T w="700" size={15}>{L(r.name)}</T>
                <T size={12.5} color={colors.muted}>{L(r.available)}</T>
              </View>
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${r.phone}`)}
                style={{
                  backgroundColor: colors.dangerDark, borderRadius: 12, paddingHorizontal: 16,
                  paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 7,
                }}
              >
                <T w="700" size={16} color="#fff">{localizeDigits(r.phone, lang)}</T>
              </TouchableOpacity>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
