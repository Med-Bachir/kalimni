import React, { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Card, Button, BackButton } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';

export default function PrivacyScreen({ navigation }) {
  const { t } = useI18n();
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => {
    Alert.alert(t('privacy.deleteConfirmTitle'), t('privacy.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAccount(); // logs out -> navigator returns to Welcome
          } catch {
            setDeleting(false);
            Alert.alert(t('common.errorTitle'), t('common.networkError'));
          }
        },
      },
    ]);
  };

  const InfoCard = ({ icon, title, body }) => (
    <Card style={{ padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 38, height: 38, borderRadius: 11, backgroundColor: colors.bgSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <T w="700" size={15}>{title}</T>
      </View>
      <T size={13.5} color={colors.body} style={{ lineHeight: 23 }}>{body}</T>
    </Card>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14, flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('privacy.title')}</T>
        </View>

        <InfoCard icon="lock-closed-outline" title={t('privacy.encryptionTitle')} body={t('privacy.encryptionBody')} />
        <InfoCard icon="shield-checkmark-outline" title={t('privacy.lawTitle')} body={t('privacy.lawBody')} />
        <InfoCard icon="trash-outline" title={t('privacy.deleteTitle')} body={t('privacy.deleteBody')} />

        <View style={{ marginTop: 'auto' }}>
          <Button title={t('privacy.deleteCta')} variant="danger" onPress={confirmDelete} loading={deleting} />
        </View>
      </ScrollView>
    </Screen>
  );
}
