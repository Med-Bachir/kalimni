import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen, T, Button } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';

export default function WelcomeScreen({ navigation }) {
  const { t } = useI18n();
  return (
    <Screen bg="transparent" edges={['top', 'bottom']} style={{ backgroundColor: colors.bgSoft }}>
      <LinearGradient colors={[colors.bgSoft, colors.bg]} style={{ flex: 1, padding: 28 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <View
            style={{
              width: 96, height: 96, borderRadius: 32, backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 16,
              shadowOffset: { width: 0, height: 12 }, elevation: 8,
            }}
          >
            <MaterialCommunityIcons name="message-processing" size={52} color="#fff" />
          </View>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <T w="700" size={38}>{t('common.appName')}</T>
            <T size={17} color={colors.muted} style={{ textAlign: 'center', lineHeight: 29 }}>
              {t('common.tagline')}
            </T>
          </View>
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
