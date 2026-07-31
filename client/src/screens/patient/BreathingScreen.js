import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useCalm } from '../../store/calm';
import { localizeDigits } from '../../utils/format';
import { celebrate as hapticCelebrate } from '../../utils/haptics';
import { complete as soundComplete } from '../../utils/sound';

const PHASES = [
  { key: 'inhale', seconds: 4, grow: true },
  { key: 'hold', seconds: 7 },
  { key: 'exhale', seconds: 8, grow: false },
];
const TOTAL_CYCLES = 4;

export default function BreathingScreen({ navigation }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState('idle'); // idle | running | done
  const [cycle, setCycle] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [countdown, setCountdown] = useState(PHASES[0].seconds);
  const scale = useRef(new Animated.Value(1)).current;
  const completeActivity = useCalm((s) => s.completeActivity);
  const rewarded = useRef(false);

  const phase = PHASES[phaseIndex];

  // A finished round plants one thing in the garden. Guarded so a re-render
  // (or the theme remounting the tree) cannot credit the same round twice;
  // `start` clears it so a second round does count.
  useEffect(() => {
    if (state !== 'done' || rewarded.current) return;
    rewarded.current = true;
    completeActivity('breathing');
    hapticCelebrate();
    soundComplete();
  }, [state]);

  // Drive the circle: grow on inhale, hold, shrink on exhale.
  useEffect(() => {
    if (state !== 'running') return;
    if (phase.grow === true) {
      Animated.timing(scale, { toValue: 1.18, duration: phase.seconds * 1000, useNativeDriver: true }).start();
    } else if (phase.grow === false) {
      Animated.timing(scale, { toValue: 1, duration: phase.seconds * 1000, useNativeDriver: true }).start();
    }
  }, [state, phaseIndex]);

  // 1s tick: countdown -> next phase -> next cycle -> done.
  useEffect(() => {
    if (state !== 'running') return undefined;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev > 1) return prev - 1;
        if (phaseIndex < PHASES.length - 1) {
          setPhaseIndex(phaseIndex + 1);
          return PHASES[phaseIndex + 1].seconds;
        }
        if (cycle < TOTAL_CYCLES - 1) {
          setCycle(cycle + 1);
          setPhaseIndex(0);
          return PHASES[0].seconds;
        }
        setState('done');
        return 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state, phaseIndex, cycle]);

  const start = () => {
    rewarded.current = false;
    setCycle(0);
    setPhaseIndex(0);
    setCountdown(PHASES[0].seconds);
    scale.setValue(1);
    setState('running');
  };

  return (
    <Screen bg="transparent" edges={['top', 'bottom']} style={{ backgroundColor: colors.primaryDark }}>
      <LinearGradient colors={[colors.primaryDark, colors.primary]} style={{ flex: 1, padding: 24 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.14)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <T w="600" size={15} color="rgba(255,255,255,.85)">{t('breathing.title')}</T>
          <View style={{ width: 40 }} />
        </View>

        {/* Circle */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 34 }}>
          <View style={{ width: 250, height: 250, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{
              position: 'absolute', width: 250, height: 250, borderRadius: 125,
              backgroundColor: 'rgba(255,255,255,.08)', transform: [{ scale }],
            }} />
            <Animated.View style={{
              position: 'absolute', width: 194, height: 194, borderRadius: 97,
              backgroundColor: 'rgba(255,255,255,.12)', transform: [{ scale }],
            }} />
            <Animated.View style={{
              width: 134, height: 134, borderRadius: 67, backgroundColor: 'rgba(255,255,255,.9)',
              alignItems: 'center', justifyContent: 'center', transform: [{ scale }],
            }}>
              <T w="700" size={21} color={colors.primaryDark}>
                {state === 'done' ? '✓' : t(`breathing.${phase.key}`)}
              </T>
            </Animated.View>
          </View>

          {state === 'idle' && (
            <View style={{ alignItems: 'center', gap: 18 }}>
              <T size={15} color="rgba(255,255,255,.75)" style={{ textAlign: 'center', lineHeight: 26 }}>
                {t('breathing.inhaleHint')}
              </T>
              <Button title={t('breathing.start')} onPress={start} variant="light" style={{ minWidth: 200 }} />
            </View>
          )}

          {state === 'running' && (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <T size={15} color="rgba(255,255,255,.75)">{t(`breathing.${phase.key}Hint`)}</T>
              <T w="700" size={34} color="#fff">{localizeDigits(countdown, lang)}</T>
              <T size={13} color="rgba(255,255,255,.6)">
                {t('breathing.cycleOf', {
                  n: localizeDigits(cycle + 1, lang),
                  total: localizeDigits(TOTAL_CYCLES, lang),
                })}
              </T>
            </View>
          )}

          {state === 'done' && (
            <View style={{ alignItems: 'center', gap: 14 }}>
              <T w="700" size={22} color="#fff">{t('breathing.finishedTitle')}</T>
              <T size={14.5} color="rgba(255,255,255,.75)" style={{ textAlign: 'center' }}>
                {t('breathing.finishedBody')}
              </T>
              <Button title={t('breathing.again')} onPress={start} variant="light" style={{ minWidth: 200 }} />
            </View>
          )}

          {/* Cycle dots */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {Array.from({ length: TOTAL_CYCLES }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === cycle && state === 'running' ? 26 : 7,
                  height: 7, borderRadius: 4,
                  backgroundColor:
                    i < cycle || state === 'done' || (i === cycle && state === 'running')
                      ? '#fff' : 'rgba(255,255,255,.35)',
                }}
              />
            ))}
          </View>
        </View>
      </LinearGradient>
    </Screen>
  );
}
