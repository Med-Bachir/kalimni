import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, T, Button } from '../../components/ui';
import { LogoLockup } from '../../components/Logo';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';

export default function WelcomeScreen({ navigation }) {
  const { t } = useI18n();
  return (
    <Screen bg="transparent" edges={['top', 'bottom']} style={{ backgroundColor: colors.bgSoft }}>
      <LinearGradient colors={[colors.bgSoft, colors.bg]} style={{ flex: 1, padding: 28 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {/* The same mark the splash just finished drawing, now at rest.
              Seeing it land here and stay is what makes the splash read as an
              introduction rather than an interstitial to sit through. */}
          <LogoLockup size={96} name={t('common.appName')} tagline={t('common.tagline')} />
        </View>
        <View style={{ gap: 12 }}>
          <Button title={t('auth.createAccount')} onPress={() => navigation.navigate('Signup')} />
          <Button title={t('auth.login')} variant="outline" onPress={() => navigation.navigate('Login')} />
          <TouchableOpacity onPress={() => navigation.navigate('Crisis')} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <T w="600" size={13.5} color={colors.dangerDark}>{t('home.crisisBanner')}</T>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Screen>
  );
}
