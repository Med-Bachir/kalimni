import React, { useState, useRef, useEffect } from 'react';
import { View, Pressable, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button, BackButton } from '../../components/ui';
import { PopIn } from '../../components/motion';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useCalm } from '../../store/calm';
import { GROUNDING_STEPS } from '../../utils/calmData';
import { tap as hapticTap, success as hapticSuccess, celebrate as hapticCelebrate } from '../../utils/haptics';
import { complete as soundComplete } from '../../utils/sound';

// 5-4-3-2-1 sensory grounding.
//
// The counts descend on purpose: the exercise gets easier as attention comes
// back, so it never becomes another thing that is too hard right now. There is
// no text input anywhere — during a panic spike, typing is a wall. You notice
// something, you tap, that is the entire interaction.
//
// No timer and no failure state. Leaving halfway is fine; the exit is always
// one tap away and always labelled.

function Dot({ filled, delay }) {
  const fill = useRef(new Animated.Value(filled ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: filled ? 1 : 0,
      duration: 260,
      delay: filled ? delay : 0,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();
  }, [filled]);

  return (
    <View
      style={{
        width: 30, height: 30, borderRadius: 15,
        borderWidth: 2, borderColor: 'rgba(255,255,255,.55)',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF',
          opacity: fill,
          transform: [{ scale: fill }],
        }}
      />
    </View>
  );
}

export default function GroundingScreen({ navigation }) {
  const { t } = useI18n();
  const addGrowth = useCalm((s) => s.addGrowth);

  const [stepIndex, setStepIndex] = useState(-1); // -1 = intro, LENGTH = done
  const [counted, setCounted] = useState(0);
  const rewarded = useRef(false);

  const step = GROUNDING_STEPS[stepIndex];
  const done = stepIndex >= GROUNDING_STEPS.length;

  useEffect(() => {
    if (!done || rewarded.current) return;
    rewarded.current = true; // never double-credit a re-render
    addGrowth(1);
    hapticCelebrate();
    soundComplete();
  }, [done]);

  const notice = () => {
    const next = counted + 1;
    if (next >= step.count) {
      hapticSuccess();
      setCounted(next);
      // A beat to see the last dot land before the step changes.
      setTimeout(() => {
        setStepIndex((i) => i + 1);
        setCounted(0);
      }, 620);
    } else {
      hapticTap();
      setCounted(next);
    }
  };

  // --- intro ---------------------------------------------------------------
  if (stepIndex === -1) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, padding: 24, gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BackButton onPress={() => navigation.goBack()} />
            <T w="700" size={20}>{t('grounding.title')}</T>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
            <View
              style={{
                width: 78, height: 78, borderRadius: 39, backgroundColor: colors.bgSoft,
                alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
              }}
            >
              <Ionicons name="footsteps-outline" size={34} color={colors.primary} />
            </View>
            <T w="700" size={19} style={{ textAlign: 'center' }}>{t('grounding.introTitle')}</T>
            <T size={14.5} color={colors.body} style={{ textAlign: 'center', lineHeight: 26 }}>
              {t('grounding.introBody')}
            </T>
          </View>
          <Button title={t('grounding.start')} onPress={() => setStepIndex(0)} />
        </View>
      </Screen>
    );
  }

  // --- done ----------------------------------------------------------------
  if (done) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}>
          <PopIn>
            <View style={{ alignItems: 'center', gap: 16 }}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
              <T w="700" size={20} style={{ textAlign: 'center' }}>{t('grounding.doneTitle')}</T>
              <T size={14.5} color={colors.body} style={{ textAlign: 'center', lineHeight: 26 }}>
                {t('grounding.doneBody')}
              </T>
            </View>
          </PopIn>
          <View style={{ gap: 10, marginTop: 14 }}>
            <Button
              title={t('grounding.again')}
              variant="outline"
              onPress={() => { rewarded.current = false; setStepIndex(0); setCounted(0); }}
            />
            <Button title={t('common.close')} onPress={() => navigation.goBack()} />
          </View>
        </View>
      </Screen>
    );
  }

  // --- a step --------------------------------------------------------------
  return (
    <Screen edges={['top', 'bottom']} bg={colors.primaryDark}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={{ flex: 1 }}>
        <View style={{ padding: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton light onPress={() => navigation.goBack()} />
          <T w="600" size={14} color="rgba(255,255,255,.8)">
            {t('grounding.stepOf', { n: stepIndex + 1, total: GROUNDING_STEPS.length })}
          </T>
        </View>

        {/* The whole area is the button — a single, unmissable target. */}
        <Pressable
          onPress={notice}
          accessibilityRole="button"
          accessibilityLabel={t('grounding.tapHint')}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32, padding: 28 }}
        >
          <Ionicons name={step.icon} size={44} color="rgba(255,255,255,.9)" />
          <T w="700" size={26} color="#FFFFFF" style={{ textAlign: 'center', lineHeight: 40 }}>
            {t(`grounding.steps.${step.key}`, { n: step.count })}
          </T>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            {Array.from({ length: step.count }, (_, i) => (
              <Dot key={i} filled={i < counted} delay={0} />
            ))}
          </View>

          <T size={13.5} color="rgba(255,255,255,.65)" style={{ textAlign: 'center', lineHeight: 22 }}>
            {t('grounding.tapHint')}
          </T>
        </Pressable>
      </LinearGradient>
    </Screen>
  );
}
