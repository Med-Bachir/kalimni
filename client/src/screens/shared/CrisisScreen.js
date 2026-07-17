import React from 'react';
import { View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, BackButton, LoadingView, ErrorView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { localizeDigits } from '../../utils/format';

// Crisis / emergency screen: always reachable, works before login too.
export default function CrisisScreen({ navigation }) {
  const { t, lang, L } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['safetyResources'],
    queryFn: () => api('/safety/resources'),
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('crisis.title')}</T>
        </View>

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
