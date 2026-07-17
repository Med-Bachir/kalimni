import React from 'react';
import { View, ScrollView, Alert, Switch } from 'react-native';
import { Screen, T, Card, Avatar, Button, Badge } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';
import { useSettings } from '../../store/settings';
import { ensureLayoutDirection } from '../../utils/rtl';

export default function SpecialistProfileScreen() {
  const { t, lang } = useI18n();
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const logout = useAuth((s) => s.logout);
  const setLanguage = useSettings((s) => s.setLanguage);
  const themeMode = useSettings((s) => s.themeMode);
  const setTheme = useSettings((s) => s.setTheme);
  const notifications = user.settings?.notifications !== false;

  const switchLanguage = () => {
    const next = lang === 'ar' ? 'fr' : 'ar';
    Alert.alert(t('profile.language'), t('profile.languageRestartNote'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: next === 'ar' ? t('profile.arabic') : t('profile.french'),
        onPress: async () => {
          await setLanguage(next);
          updateProfile({ language: next }).catch(() => {});
          ensureLayoutDirection(next);
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
        <T w="700" size={22}>{t('profile.title')}</T>

        <Card style={{ padding: 22, alignItems: 'center', gap: 10, borderRadius: 20 }}>
          <Avatar name={user.name} size={76} color={[colors.primary, '#fff']} />
          <View style={{ alignItems: 'center', gap: 3 }}>
            <T w="700" size={18}>{user.name}</T>
            <T size={13} color={colors.muted}>{user.email}</T>
          </View>
          <Badge label={t('chat.specialistTitle')} fg={colors.primaryDark} bg={colors.bgSoft} />
          {user.bio ? (
            <T size={13.5} color={colors.body} style={{ textAlign: 'center', lineHeight: 23 }}>{user.bio}</T>
          ) : null}
          {user.license ? (
            <T size={12} color={colors.faint}>{t('admin.license', { license: user.license })}</T>
          ) : null}
        </Card>

        <Card style={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T w="600" size={15}>{t('profile.notifications')}</T>
            <Switch
              value={notifications}
              onValueChange={(v) => updateProfile({ settings: { notifications: v } }).catch(() => {})}
              trackColor={{ false: colors.track, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={{ height: 1, backgroundColor: colors.divider }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T w="600" size={15}>{t('profile.darkMode')}</T>
            <Switch
              value={themeMode === 'dark'}
              onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
              trackColor={{ false: colors.track, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={{ height: 1, backgroundColor: colors.divider }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T w="600" size={15}>{t('profile.language')}</T>
            <T w="600" size={13.5} color={colors.primary} onPress={switchLanguage}>
              {lang === 'ar' ? t('profile.arabic') : t('profile.french')}
            </T>
          </View>
        </Card>

        <Button title={t('profile.logout')} variant="danger" icon="log-out-outline" onPress={logout} style={{ height: 52 }} />
      </ScrollView>
    </Screen>
  );
}
