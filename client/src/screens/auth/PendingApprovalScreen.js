import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useAuth } from '../../store/auth';

// Specialists land here after signup until an admin approves their account.
export default function PendingApprovalScreen() {
  const { t } = useI18n();
  const user = useAuth((s) => s.user);
  const refreshMe = useAuth((s) => s.refreshMe);
  const logout = useAuth((s) => s.logout);
  const [checking, setChecking] = useState(false);

  const rejected = user?.status === 'rejected';

  const check = async () => {
    setChecking(true);
    try {
      await refreshMe();
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <View style={{
          width: 88, height: 88, borderRadius: 30, backgroundColor: rejected ? colors.dangerBg : colors.bgSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons
            name={rejected ? 'close-circle-outline' : 'hourglass-outline'}
            size={42} color={rejected ? colors.dangerDark : colors.primary}
          />
        </View>
        <T w="700" size={22} style={{ textAlign: 'center' }}>
          {rejected ? t('auth.rejectedTitle') : t('auth.pendingTitle')}
        </T>
        <T size={15} color={colors.muted} style={{ textAlign: 'center', lineHeight: 26 }}>
          {rejected ? t('auth.rejectedBody') : t('auth.pendingBody')}
        </T>
      </View>
      <View style={{ padding: 24, gap: 12 }}>
        {!rejected && (
          <Button title={t('auth.pendingRefresh')} onPress={check} loading={checking} variant="outline" />
        )}
        <Button title={t('profile.logout')} variant="danger" onPress={logout} />
      </View>
    </Screen>
  );
}
