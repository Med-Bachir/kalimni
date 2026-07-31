import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Pressable, Animated, Easing, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button, BackButton } from '../../components/ui';
import { PopIn } from '../../components/motion';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useCalm } from '../../store/calm';
import { localizeDigits } from '../../utils/format';
import { tap as hapticTap, celebrate as hapticCelebrate } from '../../utils/haptics';
import { pop as soundPop, complete as soundComplete } from '../../utils/sound';

// Passing thoughts, as bubbles.
//
// The therapeutic idea underneath is defusion: a thought is an event that
// happens to you, not a fact about you, and it passes whether or not you
// wrestle with it. So the toy is built so that *both* endings are wins — a
// bubble you pop and a bubble you let drift off the top of the screen are
// counted the same on the summary screen, and the copy says so out loud.
//
// The bubbles are deliberately blank. Printing worries on them would put words
// in someone's head that they had not thought yet, which is the opposite of
// what this is for.

const COUNT = 14;
const MIN_RISE = 8500;
const MAX_RISE = 14000;

function Bubble({ index, width, height, onGone, onPop }) {
  const rise = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [popped, setPopped] = useState(false);
  const reported = useRef(false);

  // Fixed per bubble, chosen once on mount so nothing jitters between frames.
  const conf = useRef({
    size: 44 + Math.random() * 52,
    x: 0.08 + Math.random() * 0.78,
    sway: (Math.random() > 0.5 ? 1 : -1) * (12 + Math.random() * 26),
    duration: MIN_RISE + Math.random() * (MAX_RISE - MIN_RISE),
    delay: index * (450 + Math.random() * 500),
  }).current;

  const finish = useCallback((wasPopped) => {
    if (reported.current) return;
    reported.current = true;
    onGone(wasPopped);
  }, [onGone]);

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: conf.duration,
      delay: conf.delay,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => finished && finish(false));
  }, []);

  const burst = () => {
    if (popped) return;
    setPopped(true);
    hapticTap();
    // Quietest sound in the palette by some margin — this one can fire
    // fourteen times in a minute and still has to sit under the room.
    soundPop();
    onPop();
    Animated.timing(pop, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => finish(true));
  };

  const left = width * conf.x - conf.size / 2;

  return (
    <Animated.View
      pointerEvents={popped ? 'none' : 'auto'}
      style={{
        position: 'absolute',
        left: Math.max(4, Math.min(left, width - conf.size - 4)),
        top: 0,
        opacity: Animated.multiply(
          rise.interpolate({ inputRange: [0, 0.06, 0.86, 1], outputRange: [0, 1, 1, 0] }),
          pop.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
        ),
        transform: [
          { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [height, -conf.size - 20] }) },
          { translateX: rise.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, conf.sway, 0] }) },
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
        ],
      }}
    >
      <Pressable
        onPress={burst}
        accessibilityRole="button"
        hitSlop={10}
        style={{
          width: conf.size, height: conf.size, borderRadius: conf.size / 2,
          backgroundColor: 'rgba(255,255,255,.22)',
          borderWidth: 1.5, borderColor: 'rgba(255,255,255,.45)',
        }}
      >
        {/* highlight — makes it read as a bubble rather than a circle */}
        <View
          style={{
            position: 'absolute', top: conf.size * 0.18, left: conf.size * 0.2,
            width: conf.size * 0.24, height: conf.size * 0.16, borderRadius: conf.size,
            backgroundColor: 'rgba(255,255,255,.55)',
            transform: [{ rotate: '-25deg' }],
          }}
        />
      </Pressable>
    </Animated.View>
  );
}

export default function BubblesScreen({ navigation }) {
  const { t, lang } = useI18n();
  const { width, height } = useWindowDimensions();
  const completeActivity = useCalm((s) => s.completeActivity);

  const [running, setRunning] = useState(false);
  const [popped, setPopped] = useState(0);
  const [gone, setGone] = useState(0);
  const [round, setRound] = useState(0); // remounts the field for "again"
  const rewarded = useRef(false);

  const finished = running && gone >= COUNT;
  const n = (v) => localizeDigits(v, lang);

  useEffect(() => {
    if (!finished || rewarded.current) return;
    rewarded.current = true;
    completeActivity('bubbles');
    hapticCelebrate();
    soundComplete();
  }, [finished]);

  const handleGone = useCallback(() => setGone((g) => g + 1), []);
  const handlePop = useCallback(() => setPopped((p) => p + 1), []);

  const start = () => {
    rewarded.current = false;
    setPopped(0);
    setGone(0);
    setRound((r) => r + 1);
    setRunning(true);
  };

  return (
    <Screen edges={['top', 'bottom']} bg={colors.primaryDark}>
      <LinearGradient colors={['#7FA9BF', colors.primaryDark]} style={{ flex: 1 }}>
        <View style={{ padding: 22, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 2 }}>
          <BackButton light onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <T w="700" size={17} color="#FFFFFF">{t('bubbles.title')}</T>
          </View>
          {running && !finished && (
            <T w="600" size={13} color="rgba(255,255,255,.75)">
              {n(popped)} / {n(COUNT)}
            </T>
          )}
        </View>

        {!running ? (
          <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 20 }}>
            <Ionicons name="water-outline" size={46} color="rgba(255,255,255,.9)" style={{ alignSelf: 'center' }} />
            <T w="700" size={21} color="#FFFFFF" style={{ textAlign: 'center', lineHeight: 33 }}>
              {t('bubbles.introTitle')}
            </T>
            <T size={14.5} color="rgba(255,255,255,.8)" style={{ textAlign: 'center', lineHeight: 26 }}>
              {t('bubbles.introBody')}
            </T>
            <Button title={t('bubbles.start')} variant="light" onPress={start} style={{ marginTop: 10 }} />
          </View>
        ) : finished ? (
          <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 18 }}>
            <PopIn>
              <View style={{ alignItems: 'center', gap: 14 }}>
                <Ionicons name="checkmark-circle" size={58} color="#FFFFFF" />
                <T w="700" size={20} color="#FFFFFF" style={{ textAlign: 'center' }}>
                  {t('bubbles.doneTitle')}
                </T>
                <T size={14.5} color="rgba(255,255,255,.85)" style={{ textAlign: 'center', lineHeight: 26 }}>
                  {t('bubbles.doneBody', { popped: n(popped), drifted: n(COUNT - popped) })}
                </T>
                <T size={13} color="rgba(255,255,255,.65)" style={{ textAlign: 'center', lineHeight: 22 }}>
                  {t('bubbles.doneNote')}
                </T>
              </View>
            </PopIn>
            <View style={{ gap: 10, marginTop: 10 }}>
              <Button title={t('bubbles.again')} variant="light" onPress={start} />
              <Button title={t('common.close')} variant="outline" onPress={() => navigation.goBack()} />
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, overflow: 'hidden' }}>
            {Array.from({ length: COUNT }, (_, i) => (
              <Bubble
                key={`${round}-${i}`}
                index={i}
                width={width}
                height={height}
                onGone={handleGone}
                onPop={handlePop}
              />
            ))}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 26, alignItems: 'center' }}>
              <T size={13} color="rgba(255,255,255,.6)">{t('bubbles.hint')}</T>
            </View>
          </View>
        )}
      </LinearGradient>
    </Screen>
  );
}
