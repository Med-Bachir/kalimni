import React, { useState, useRef, useEffect } from 'react';
import { View, Pressable, Animated, Easing, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Card, Button, BackButton } from '../../components/ui';
import { PopIn } from '../../components/motion';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useCalm } from '../../store/calm';
import { localizeDigits } from '../../utils/format';
import { REFRAME_CARDS } from '../../utils/calmData';
import { tap as hapticTap, success as hapticSuccess, celebrate as hapticCelebrate } from '../../utils/haptics';
import { complete as soundComplete } from '../../utils/sound';

// Thought-trap cards.
//
// Front: a thought, written the way people actually think it. Back: the name of
// the trap it belongs to, and a rewrite that is *believable* rather than
// cheerful. "Everything will be fine!" is not a reframe, it is a lie the reader
// will correctly reject; "this is hard and it is also not permanent" is one
// they can hold.
//
// Naming the distortion is the transferable skill — once you can spot
// all-or-nothing thinking on a card, you start spotting it in your own head.
// That is why the trap name is on the back and not hidden in an article.

const FLIP_MS = 460;

function FlipCard({ card, onFlipped }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [face, setFace] = useState('front');
  const { t } = useI18n();

  // A fresh card comes in face-up: reset both the value and the flag.
  useEffect(() => {
    flip.setValue(0);
    setFace('front');
  }, [card.id]);

  const turn = () => {
    const toBack = face === 'front';
    hapticTap();
    Animated.timing(flip, {
      toValue: toBack ? 1 : 0,
      duration: FLIP_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setFace(toBack ? 'back' : 'front');
    if (toBack) onFlipped?.();
  };

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  // Opacity swaps exactly at the halfway point, so the faces never overlap
  // even on devices where backfaceVisibility is unreliable.
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });

  const faceStyle = {
    backfaceVisibility: 'hidden',
    borderRadius: 20,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
    minHeight: 300,
  };

  return (
    <Pressable onPress={turn} accessibilityRole="button" accessibilityLabel={t('reframe.flip')}>
      <View style={{ minHeight: 300 }}>
        <Animated.View
          style={[
            faceStyle,
            {
              backgroundColor: colors.card,
              borderWidth: 1.5,
              borderColor: colors.border,
              opacity: frontOpacity,
              transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
            },
          ]}
        >
          <Ionicons name="chatbox-ellipses-outline" size={26} color={colors.faint} />
          <T w="600" size={20} style={{ lineHeight: 34 }}>
            {t(`reframe.cards.${card.id}.thought`)}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Ionicons name="sync-outline" size={15} color={colors.primary} />
            <T w="600" size={13} color={colors.primary}>{t('reframe.flip')}</T>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            faceStyle,
            {
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: colors.bgSoft,
              borderWidth: 1.5,
              borderColor: colors.inputBorder,
              opacity: backOpacity,
              transform: [{ perspective: 1000 }, { rotateY: backRotate }],
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name={card.icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T size={11} w="600" color={colors.faint}>{t('reframe.trapLabel')}</T>
              <T w="700" size={15}>{t(`reframe.cards.${card.id}.trap`)}</T>
            </View>
          </View>
          <T size={13.5} color={colors.body} style={{ lineHeight: 24 }}>
            {t(`reframe.cards.${card.id}.why`)}
          </T>
          <View style={{ height: 1, backgroundColor: colors.divider }} />
          <T size={11} w="600" color={colors.faint}>{t('reframe.kinderLabel')}</T>
          <T w="600" size={15} color={colors.primaryDark} style={{ lineHeight: 27 }}>
            {t(`reframe.cards.${card.id}.kinder`)}
          </T>
        </Animated.View>
      </View>
    </Pressable>
  );
}

export default function ReframeScreen({ navigation }) {
  const { t, lang } = useI18n();
  const addGrowth = useCalm((s) => s.addGrowth);

  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState(0);
  const [done, setDone] = useState(false);
  const rewarded = useRef(false);

  const n = (v) => localizeDigits(v, lang);
  const card = REFRAME_CARDS[index];

  useEffect(() => {
    if (!done || rewarded.current) return;
    rewarded.current = true;
    addGrowth(1);
    hapticCelebrate();
    soundComplete();
  }, [done]);

  const next = () => {
    hapticSuccess();
    if (index + 1 >= REFRAME_CARDS.length) setDone(true);
    else setIndex(index + 1);
  };

  if (done) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}>
          <PopIn>
            <View style={{ alignItems: 'center', gap: 16 }}>
              <Ionicons name="checkmark-circle" size={62} color={colors.success} />
              <T w="700" size={20} style={{ textAlign: 'center' }}>{t('reframe.doneTitle')}</T>
              <T size={14.5} color={colors.body} style={{ textAlign: 'center', lineHeight: 26 }}>
                {t('reframe.doneBody')}
              </T>
            </View>
          </PopIn>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Button
              title={t('reframe.again')}
              variant="outline"
              onPress={() => { rewarded.current = false; setIndex(0); setSeen(0); setDone(false); }}
            />
            <Button title={t('common.close')} onPress={() => navigation.goBack()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 20, flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={{ flex: 1, gap: 2 }}>
            <T w="700" size={19}>{t('reframe.title')}</T>
            <T size={12.5} color={colors.muted}>
              {t('reframe.progress', { n: n(index + 1), total: n(REFRAME_CARDS.length) })}
            </T>
          </View>
        </View>

        {/* Progress pips rather than a bar: ten cards is a countable number, and
            a bar would imply a score. */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {REFRAME_CARDS.map((c, i) => (
            <View
              key={c.id}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                backgroundColor: i <= index ? colors.primary : colors.track,
              }}
            />
          ))}
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <FlipCard card={card} onFlipped={() => setSeen((s) => s + 1)} />
        </View>

        <Card style={{ padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={17} color={colors.faint} />
          <T size={12} color={colors.faint} style={{ flex: 1, lineHeight: 20 }}>
            {t('reframe.disclaimer')}
          </T>
        </Card>

        <Button
          title={index + 1 >= REFRAME_CARDS.length ? t('reframe.finish') : t('reframe.next')}
          onPress={next}
        />
      </ScrollView>
    </Screen>
  );
}
