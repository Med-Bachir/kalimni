import React, { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { Screen, T, Button, Input, BackButton, Card } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';
import { formatDate } from '../../utils/format';

export default function PersonalDataScreen({ navigation }) {
  const { t, lang } = useI18n();
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      Alert.alert(t('personal.saveSuccess'));
      navigation.goBack();
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('personal.title')}</T>
        </View>

        <Input label={t('auth.fullName')} value={name} onChangeText={setName} />
        <View style={{ gap: 7 }}>
          <T w="600" size={14}>{t('auth.email')}</T>
          <Card style={{ height: 54, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.bgSoft }}>
            <T size={15} color={colors.muted}>{user.email}</T>
          </Card>
        </View>
        <T size={13} color={colors.faint}>
          {t('profile.memberSince', { date: formatDate(user.createdAt, lang) })}
        </T>

        <View style={{ marginTop: 'auto' }}>
          <Button title={t('common.save')} onPress={save} loading={saving} disabled={!name.trim() || name.trim() === user.name} />
        </View>
      </ScrollView>
    </Screen>
  );
}
