import React from 'react';
import { View, Pressable, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from './ui';
import SpiritAnimal from './SpiritAnimal';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { useSpirit } from '../store/spirit';
import { tap as hapticTap } from '../utils/haptics';

// "You have not met your spirit animal yet." Nothing more.
//
// This replaced a permanent strip under the chat header that showed the animal
// at all times. That strip was a mistake for a reason worth writing down: a
// full-width band with a border, a gradient and a fixed height reads as
// *chrome* — a second navigation bar — no matter what is drawn inside it. The
// animal looked like a logo in a header, which is the one thing a companion
// must not look like.
//
// So the animal moved out into components/FloatingSpirit, where it walks around
// on top of the app and is not attached to any screen, and what is left here is
// only an invitation, which disappears the moment it is accepted. Once someone
// has a spirit, this renders nothing and the chat is a chat again.

export default function SpiritInvite({ onPress }) {
  const { t } = useI18n();
  const id = useSpirit((s) => s.id);

  // Already met — the roaming companion takes it from here.
  if (id) return null;

  const chevron = I18nManager.isRTL ? 'chevron-back' : 'chevron-forward';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress?.();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: 12,
        marginTop: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.primary,
            opacity: 0.1,
          }}
        />
        {/* One silhouette, faded: there is someone in here, without spoiling
            which of the six it turns out to be. */}
        <SpiritAnimal id="deer" size={44} aura={false} style={{ opacity: 0.45 }} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T w="700" size={14}>{t('spirit.bandPrompt')}</T>
        <T size={11.5} color={colors.muted} style={{ lineHeight: 17 }} numberOfLines={2}>
          {t('spirit.bandPromptBody')}
        </T>
      </View>
      <Ionicons name={chevron} size={16} color={colors.faint} />
    </Pressable>
  );
}
