import React, { useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, I18nManager,
  Animated, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, avatarColors, severityColors } from '../theme/colors';
import { initialsOf } from '../utils/format';
import { useI18n } from '../i18n';
import { tap as hapticTap } from '../utils/haptics';

const FONT = {
  400: 'IBMPlexSansArabic_400Regular',
  500: 'IBMPlexSansArabic_500Medium',
  600: 'IBMPlexSansArabic_600SemiBold',
  700: 'IBMPlexSansArabic_700Bold',
};

// Themed text. Usage: <T w="700" size={22} color={colors.ink}>...</T>
export function T({ w = '400', size = 14, color = colors.ink, style, children, ...rest }) {
  return (
    <Text style={[{ fontFamily: FONT[w] || FONT[400], fontSize: size, color }, style]} {...rest}>
      {children}
    </Text>
  );
}

// Press target that scales down under the thumb and ticks the haptic motor,
// instead of TouchableOpacity's opacity dip (which reads as "disabled" rather
// than "pressed"). Card and Button build on this, so most of the app gets
// press feedback for free.
//
// Lives here rather than in motion.js because that module imports from this
// one; the dependency has to stay one-directional.
export function PressableScale({
  onPress, children, style, disabled, scaleTo = 0.97, haptic = true, ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue) =>
    Animated.spring(scale, { toValue, speed: 45, bounciness: 5, useNativeDriver: true }).start();

  return (
    <Pressable
      onPressIn={() => spring(scaleTo)}
      onPressOut={() => spring(1)}
      onPress={(e) => {
        if (haptic) hapticTap();
        onPress?.(e);
      }}
      disabled={disabled}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Screen({ children, style, edges = ['top'], bg = colors.bg }) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style, icon }) {
  const palette = {
    primary: { bg: colors.primary, fg: '#fff', border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.primary, border: 'rgba(41,98,126,.35)' },
    light: { bg: colors.card, fg: colors.ink, border: colors.inputBorder },
    danger: { bg: colors.card, fg: colors.dangerDark, border: colors.dangerBorder },
  }[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.6 : 1 },
        variant === 'primary' && styles.buttonShadow,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          {icon ? <Ionicons name={icon} size={19} color={palette.fg} /> : null}
          <T w="600" size={17} color={palette.fg}>{title}</T>
        </View>
      )}
    </PressableScale>
  );
}

export function Input({ label, ltr, style, error, ...rest }) {
  return (
    <View style={{ gap: 7 }}>
      {label ? <T w="600" size={14}>{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        style={[
          styles.input,
          {
            textAlign: ltr ? 'left' : I18nManager.isRTL ? 'right' : 'left',
            writingDirection: ltr ? 'ltr' : undefined,
            borderColor: error ? colors.danger : colors.inputBorder,
          },
          style,
        ]}
        {...rest}
      />
      {error ? <T size={12.5} color={colors.dangerDark}>{error}</T> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, badge }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.primary : colors.bgSoft }]}
    >
      <T w={active ? '600' : '500'} size={13.5} color={active ? '#fff' : colors.muted}>
        {label}{badge != null ? ` · ${badge}` : ''}
      </T>
    </TouchableOpacity>
  );
}

export function Avatar({ name, size = 46, color, online }) {
  const [bg, fg] = color || avatarColors(name);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <T w="700" size={size * 0.36} color={fg}>{initialsOf(name)}</T>
      </View>
      {online != null && online ? (
        <View
          style={{
            position: 'absolute', bottom: 0, left: 0,
            width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14,
            backgroundColor: colors.online, borderWidth: 2.5, borderColor: colors.card,
          }}
        />
      ) : null}
    </View>
  );
}

export function Badge({ label, fg, bg }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4 }}>
      <T w="700" size={11.5} color={fg}>{label}</T>
    </View>
  );
}

export function LevelBadge({ label, level }) {
  const { fg, bg } = severityColors(level);
  return <Badge label={label} fg={fg} bg={bg} />;
}

export function CountBadge({ count }) {
  if (!count) return null;
  return (
    <View style={styles.countBadge}>
      <T w="700" size={11.5} color="#fff">{count}</T>
    </View>
  );
}

export function Card({ children, style, onPress }) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return body;
  return <PressableScale onPress={onPress}>{body}</PressableScale>;
}

export function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <T w="700" size={17}>{title}</T>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction}>
          <T w="600" size={13} color={colors.primary}>{actionLabel}</T>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function BackButton({ onPress, light }) {
  // Chevron points "back" respecting layout direction.
  const name = I18nManager.isRTL ? 'chevron-forward' : 'chevron-back';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.iconCircle, light && { backgroundColor: 'rgba(255,255,255,.14)' }]}
    >
      <Ionicons name={name} size={22} color={light ? '#fff' : colors.ink} />
    </TouchableOpacity>
  );
}

export function LoadingView() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({ onRetry }) {
  const { t } = useI18n();
  return (
    <View style={[styles.center, { gap: 14, padding: 32 }]}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.faint} />
      <T w="600" size={15} color={colors.muted} style={{ textAlign: 'center' }}>
        {t('common.networkError')}
      </T>
      {onRetry ? <Button title={t('common.retry')} variant="outline" onPress={onRetry} style={{ minWidth: 180 }} /> : null}
    </View>
  );
}

export function EmptyState({ icon = 'leaf-outline', title, body }) {
  return (
    <View style={[styles.center, { gap: 10, padding: 32 }]}>
      <View style={[styles.iconCircle, { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bgSoft }]}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <T w="700" size={17} style={{ textAlign: 'center' }}>{title}</T>
      {body ? (
        <T size={14} color={colors.muted} style={{ textAlign: 'center', lineHeight: 22 }}>{body}</T>
      ) : null}
    </View>
  );
}

// NOT StyleSheet.create: that would freeze the palette at import time. The
// color-dependent entries are getters so each access re-reads the mutated
// `colors` object (theme switching remounts the tree; see App.js).
const styles = {
  button: {
    height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  get buttonShadow() {
    return {
      shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 }, elevation: 5,
    };
  },
  get input() {
    return {
      height: 54, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1.5,
      paddingHorizontal: 16, fontSize: 15, color: colors.ink,
      fontFamily: 'IBMPlexSansArabic_400Regular',
    };
  },
  chip: {
    height: 36, paddingHorizontal: 18, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  get card() {
    return { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16 };
  },
  get countBadge() {
    return {
      minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
    };
  },
  get iconCircle() {
    return {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgSoft,
      alignItems: 'center', justifyContent: 'center',
    };
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
};
