import React, { useState } from 'react';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button, Input, BackButton } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';
import { useSettings } from '../../store/settings';

export default function SignupScreen({ navigation }) {
  const { t } = useI18n();
  const register = useAuth((s) => s.register);
  const language = useSettings((s) => s.language);
  const [role, setRole] = useState('patient');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!agreed) {
      setError(t('auth.mustAgreeTerms'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await register({ name: name.trim(), email: email.trim(), password, role, language });
    } catch (e) {
      const known = ['email_taken', 'password_too_short', 'email_invalid', 'name_required'];
      setError(
        e.code === 'network'
          ? t('common.networkError')
          : known.includes(e.code)
            ? t(`auth.errors.${e.code}`)
            : t('common.errorTitle')
      );
    } finally {
      setLoading(false);
    }
  };

  const RoleTab = ({ value, label }) => (
    <TouchableOpacity
      onPress={() => setRole(value)}
      style={{
        flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        backgroundColor: role === value ? colors.primary : 'transparent',
      }}
    >
      <T w={role === value ? '600' : '500'} size={15} color={role === value ? '#fff' : colors.muted}>
        {label}
      </T>
    </TouchableOpacity>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 22, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('auth.signupTitle')}</T>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.bgSoft, borderRadius: 14, padding: 5 }}>
          <RoleTab value="patient" label={t('auth.iAmPatient')} />
          <RoleTab value="specialist" label={t('auth.iAmSpecialist')} />
        </View>

        <View style={{ gap: 16 }}>
          <Input label={t('auth.fullName')} value={name} onChangeText={setName} />
          <Input
            label={t('auth.email')} ltr value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" autoComplete="email"
          />
          <Input label={t('auth.password')} ltr value={password} onChangeText={setPassword} secureTextEntry />
          <TouchableOpacity
            onPress={() => setAgreed((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
              backgroundColor: agreed ? colors.primary : '#fff',
              borderWidth: agreed ? 0 : 1.5, borderColor: colors.inputBorder,
            }}>
              {agreed ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
            </View>
            <T size={13} color={colors.muted} style={{ flex: 1, lineHeight: 21 }}>
              {t('auth.agreeTermsPrefix')}{' '}
              <T w="600" size={13} color={colors.primary}>{t('auth.termsLink')}</T>
            </T>
          </TouchableOpacity>
          {error ? <T size={13.5} color={colors.dangerDark}>{error}</T> : null}
        </View>

        <View style={{ marginTop: 'auto', gap: 14 }}>
          <Button
            title={t('auth.continue')} onPress={submit} loading={loading}
            disabled={!name || !email || !password}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <T size={14} color={colors.muted}>{t('auth.haveAccount')}</T>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <T w="600" size={14} color={colors.primary}>{t('auth.loginCta')}</T>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
