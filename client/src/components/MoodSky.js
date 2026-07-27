import React from 'react';
import { View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { T } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { WEATHER } from '../utils/calmData';
import { tap as hapticTap } from '../utils/haptics';

// Mood asked as weather instead of a number.
//
// The value sent to the server is still 1-5 — the trend chart, the history
// screen and every stored entry are untouched. This only changes the question,
// because "which sky is today?" is answerable when "rate your mood 1 to 5"
// is not. Numbers imply a right answer; weather is just weather, and nobody
// feels judged for a rainy day.
//
// The selected tile fills with its own sky gradient, so the row visibly changes
// mood as you move across it.

export default function MoodSky({ value, onChange, label }) {
  const { t } = useI18n();

  return (
    <View style={{ gap: 10 }}>
      {label ? <T w="600" size={14}>{label}</T> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {WEATHER.map((w) => {
          const active = value === w.value;
          return (
            <Pressable
              key={w.key}
              onPress={() => { hapticTap(); onChange(w.value); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(`weather.${w.key}`)}
              style={{ flex: 1 }}
            >
              <LinearGradient
                colors={active ? w.sky : [colors.card, colors.card]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{
                  height: 74, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5,
                  borderWidth: active ? 0 : 1.5, borderColor: colors.border,
                }}
              >
                <Ionicons
                  name={active ? w.icon : `${w.icon}-outline`}
                  size={22}
                  color={active ? '#FFFFFF' : colors.muted}
                />
                <T w={active ? '600' : '500'} size={10.5} color={active ? '#FFFFFF' : colors.faint}>
                  {t(`weather.${w.key}`)}
                </T>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
