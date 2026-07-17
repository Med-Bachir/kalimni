import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen, T, Button, Input } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';

export default function LoginScreen({ navigation }) {
  const { t } = useI18n();
  const login = useAuth((s) => s.login);
  const googleLogin = useAuth((s) => s.googleLogin);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e.code === 'network' ? t('common.networkError') : t('auth.errors.invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  // Mock Google sign-in for development: uses a fixed demo Google account.
  const google = async () => {
    try {
      await googleLogin('demo.google@kalimni.app', 'Google Demo');
    } catch (e) {
      Alert.alert(t('common.errorTitle'), t('common.networkError'));
    }
  };

  return (
    <Screen bg="transparent" edges={['top', 'bottom']} style={{ backgroundColor: colors.bgSoft }}>
      <LinearGradient colors={[colors.bgSoft, colors.bg]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 26, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 14, marginTop: 26 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center', elevation: 6,
              shadowColor: colors.primary, shadowOpacity: 0.26, shadowRadius: 13, shadowOffset: { width: 0, height: 10 },
            }}>
              <MaterialCommunityIcons name="message-processing" size={40} color="#fff" />
            </View>
            <View style={{ alignItems: 'center', gap: 5 }}>
              <T w="700" size={26}>{t('auth.welcomeBack')}</T>
              <T size={15} color={colors.muted}>{t('auth.loginSubtitle')}</T>
            </View>
          </View>

          <View style={{ gap: 16 }}>
            <Input
              label={t('auth.email')} ltr value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              placeholder="amina@email.com"
            />
            <View>
              <Input
                label={t('auth.password')} ltr value={password} onChangeText={setPassword}
                secureTextEntry={!showPassword} placeholder="••••••••"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={{ position: 'absolute', bottom: 15, end: 16 }}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {error ? <T size={13.5} color={colors.dangerDark}>{error}</T> : null}
            <TouchableOpacity style={{ alignSelf: 'flex-end' }}>
              <T w="600" size={13.5} color={colors.primary}>{t('auth.forgotPassword')}</T>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 16, marginTop: 'auto' }}>
            <Button title={t('auth.login')} onPress={submit} loading={loading} disabled={!email || !password} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.inputBorder }} />
              <T size={12.5} color={colors.faint}>{t('auth.orContinueWith')}</T>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.inputBorder }} />
            </View>
            <Button title="Google" variant="light" icon="logo-google" onPress={google} style={{ height: 52 }} />
            <T size={11.5} color={colors.faint} style={{ textAlign: 'center' }}>{t('auth.googleMockNote')}</T>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <T size={14} color={colors.muted}>{t('auth.noAccount')}</T>
              <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
                <T w="600" size={14} color={colors.primary}>{t('auth.signupCta')}</T>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </Screen>
  );
}
