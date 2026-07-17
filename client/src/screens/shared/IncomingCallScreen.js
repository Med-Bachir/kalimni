import React, { useEffect } from 'react';
import { View, TouchableOpacity, Vibration } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Avatar } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useCall } from '../../store/call';

const BUZZ_PATTERN = [0, 500, 900]; // wait, buzz, pause — repeats while ringing

// Shown to the callee the moment call:incoming arrives, from anywhere in the
// app (pushed imperatively by useCallSignaling). No ringtone asset — a
// repeating vibration stands in for it.
export default function IncomingCallScreen() {
  const { t } = useI18n();
  const status = useCall((s) => s.status);
  const partner = useCall((s) => s.partner);
  const call = useCall((s) => s.call);
  const accept = useCall((s) => s.accept);
  const reject = useCall((s) => s.reject);
  const isVideo = call?.media === 'video';

  useEffect(() => {
    if (status !== 'incoming') return undefined;
    Vibration.vibrate(BUZZ_PATTERN, true);
    return () => Vibration.cancel();
  }, [status]);

  return (
    <Screen bg="transparent" edges={['top', 'bottom']} style={{ backgroundColor: colors.ink }}>
      <LinearGradient colors={[colors.ink, colors.primaryDark]} style={{ flex: 1, padding: 28, paddingBottom: 44 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
          }}>
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={14} color="#fff" />
            <T w="600" size={13} color="#fff">
              {t(isVideo ? 'call.incomingVideoTitle' : 'call.incomingTitle')}
            </T>
          </View>
          <Avatar name={partner?.name} size={132} />
          <View style={{ alignItems: 'center', gap: 6 }}>
            <T w="700" size={27} color="#fff">{partner?.name}</T>
            <T size={14.5} color="rgba(255,255,255,.7)">{t('chat.specialistTitle')}</T>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={reject}
              style={{
                width: 68, height: 68, borderRadius: 34, backgroundColor: colors.danger,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: colors.danger, shadowOpacity: 0.35, shadowRadius: 13,
                shadowOffset: { width: 0, height: 10 }, elevation: 8,
              }}
            >
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
            <T size={13} color="rgba(255,255,255,.75)">{t('call.decline')}</T>
          </View>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={accept}
              style={{
                width: 68, height: 68, borderRadius: 34, backgroundColor: colors.online,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: colors.online, shadowOpacity: 0.35, shadowRadius: 13,
                shadowOffset: { width: 0, height: 10 }, elevation: 8,
              }}
            >
              <Ionicons name="call" size={28} color="#fff" />
            </TouchableOpacity>
            <T size={13} color="rgba(255,255,255,.75)">{t('call.accept')}</T>
          </View>
        </View>
      </LinearGradient>
    </Screen>
  );
}
