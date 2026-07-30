import React, { useState } from 'react';
import { View, Pressable, I18nManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { T } from './ui';
import SpiritAnimal from './SpiritAnimal';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { useSpirit } from '../store/spirit';
import { useCalm } from '../store/calm';
import { dayKey } from '../utils/calmData';
import { spiritLineIndex } from '../utils/spiritData';
import { tap as hapticTap } from '../utils/haptics';

// The strip at the top of the companion chat where the spirit animal lives.
//
// Two states, and the empty one matters as much as the full one: before the
// quiz this is an invitation, not a locked feature with a padlock on it. There
// is no gate here — the companion chat works exactly the same whether or not
// anyone ever taps it.
//
// It shrinks once the conversation has messages. A 100px creature is lovely on
// an empty thread and is furniture in the way of a real conversation, so past
// the first message it steps back to a small companion in the corner.

export default function SpiritBanner({ mood = 'idle', compact = false, onOpenQuiz }) {
  const { t } = useI18n();
  const id = useSpirit((s) => s.id);
  const growth = useCalm((s) => s.growth);
  const [taps, setTaps] = useState(0);

  const chevron = I18nManager.isRTL ? 'chevron-back' : 'chevron-forward';
  const size = compact ? 58 : 92;

  const shell = (children, onPress) => (
    <Pressable onPress={onPress} disabled={!onPress}>
      <LinearGradient
        colors={[colors.bgSoft, colors.bgChat]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: compact ? 6 : 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {children}
      </LinearGradient>
    </Pressable>
  );

  // --- not met yet -----------------------------------------------------------

  if (!id) {
    return shell(
      <>
        {/* Two silhouettes behind a soft disc: "there is someone in here"
            without spoiling which one. */}
        <View style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: colors.primary,
              opacity: 0.1,
            }}
          />
          <SpiritAnimal id="deer" size={50} aura={false} style={{ opacity: 0.45 }} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T w="700" size={14.5}>{t('spirit.bandPrompt')}</T>
          <T size={12} color={colors.muted} style={{ lineHeight: 18 }} numberOfLines={2}>
            {t('spirit.bandPromptBody')}
          </T>
        </View>
        <Ionicons name={chevron} size={16} color={colors.faint} />
      </>,
      () => {
        hapticTap();
        onOpenQuiz?.();
      }
    );
  }

  // --- met -------------------------------------------------------------------

  const name = t(`spirit.animals.${id}.name`);
  const line = t(`spirit.lines.${spiritLineIndex(dayKey())}`, { name });

  return shell(
    <>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
        <SpiritAnimal id={id} size={size} mood={mood} points={growth} pulseKey={taps} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T w="700" size={compact ? 14 : 15.5}>{name}</T>
        <T size={12} color={colors.muted} style={{ lineHeight: 18 }} numberOfLines={2}>
          {mood === 'listening' ? t('spirit.listening', { name }) : line}
        </T>
      </View>
    </>,
    // Tapping the animal makes it hop. It does nothing else, and that is the
    // point: one thing in this app responds to being touched for no reason.
    () => {
      hapticTap();
      setTaps((n) => n + 1);
    }
  );
}
