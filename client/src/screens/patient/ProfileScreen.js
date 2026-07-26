import React from 'react';
import { View, ScrollView, TouchableOpacity, Switch, Alert, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, Avatar, Button, LevelBadge } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';
import { useSettings } from '../../store/settings';
import { ensureLayoutDirection } from '../../utils/rtl';
import { api } from '../../api/client';

export default function ProfileScreen({ navigation }) {
  const { t, lang, L } = useI18n();
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const logout = useAuth((s) => s.logout);
  const setLanguage = useSettings((s) => s.setLanguage);

  const { data: specialistData } = useQuery({
    queryKey: ['mySpecialist'],
    queryFn: () => api('/users/me/specialist'),
  });
  const { data: historyData } = useQuery({
    queryKey: ['history'],
    queryFn: () => api('/questionnaires/history'),
  });

  const specialist = specialistData?.specialist;
  const latestResult = historyData?.results?.[0];
  const notifications = user.settings?.notifications !== false;

  const toggleNotifications = (value) => {
    updateProfile({ settings: { notifications: value } }).catch(() => {});
  };

  const themeMode = useSettings((s) => s.themeMode);
  const setTheme = useSettings((s) => s.setTheme);

  const switchLanguage = () => {
    const next = lang === 'ar' ? 'fr' : 'ar';
    Alert.alert(
      t('profile.language'),
      t('profile.languageRestartNote'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: next === 'ar' ? t('profile.arabic') : t('profile.french'),
          onPress: async () => {
            await setLanguage(next);
            updateProfile({ language: next }).catch(() => {});
            ensureLayoutDirection(next);
          },
        },
      ]
    );
  };

  const chevron = (
    <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.faint} />
  );

  const MenuRow = ({ icon, label, onPress, right, last }) => (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 15,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider,
      }}
    >
      <View style={{
        width: 38, height: 38, borderRadius: 11, backgroundColor: colors.bgSoft,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <T w="600" size={15} style={{ flex: 1 }}>{label}</T>
      {right || chevron}
    </TouchableOpacity>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }} showsVerticalScrollIndicator={false}>
        <T w="700" size={22}>{t('profile.title')}</T>

        {/* Identity card */}
        <Card style={{ padding: 22, alignItems: 'center', gap: 10, borderRadius: 20 }}>
          <Avatar name={user.name} size={76} />
          <View style={{ alignItems: 'center', gap: 3 }}>
            <T w="700" size={18}>{user.name}</T>
            <T size={13} color={colors.muted}>{user.email}</T>
          </View>
          {specialist ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bgSoft,
              borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
            }}>
              <Avatar name={specialist.name} size={26} color={[colors.primary, '#fff']} />
              <T w="600" size={13} color={colors.primaryDark}>
                {t('profile.yourSpecialist', { name: specialist.name })}
              </T>
            </View>
          ) : (
            <T size={12.5} color={colors.faint}>{t('profile.noSpecialist')}</T>
          )}
        </Card>

        {/* Menu */}
        <Card style={{ borderRadius: 18 }}>
          <MenuRow icon="person-outline" label={t('profile.personalData')} onPress={() => navigation.navigate('PersonalData')} />
          <MenuRow
            icon="stats-chart-outline" label={t('profile.questionnaireResults')}
            onPress={() => navigation.navigate('History')}
            right={latestResult ? <LevelBadge label={L(latestResult.label)} level={latestResult.level} /> : undefined}
          />
          <MenuRow
            icon="notifications-outline" label={t('profile.notifications')}
            right={
              <Switch
                value={notifications}
                onValueChange={toggleNotifications}
                trackColor={{ false: colors.track, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
          <MenuRow
            icon="moon-outline" label={t('profile.darkMode')}
            right={
              <Switch
                value={themeMode === 'dark'}
                onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
                trackColor={{ false: colors.track, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
          <MenuRow
            icon="language-outline" label={t('profile.language')}
            onPress={switchLanguage}
            right={<T w="600" size={13.5} color={colors.muted}>{lang === 'ar' ? t('profile.arabic') : t('profile.french')}</T>}
          />
          <MenuRow icon="lock-closed-outline" label={t('profile.privacy')} onPress={() => navigation.navigate('Privacy')} />
          <MenuRow icon="call-outline" label={t('profile.emergency')} onPress={() => navigation.navigate('Crisis')} last />
        </Card>

        <Button title={t('profile.logout')} variant="danger" icon="log-out-outline" onPress={logout} style={{ height: 52 }} />
      </ScrollView>
    </Screen>
  );
}
