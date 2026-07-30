import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Pressable, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, BackButton, Card } from '../../components/ui';
import { FadeIn } from '../../components/motion';
import SpiritAnimal from '../../components/SpiritAnimal';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useSpirit } from '../../store/spirit';
import { useCalm } from '../../store/calm';
import { spiritById } from '../../utils/spiritData';
import { habitatFor } from '../../utils/spiritArt';
import { localizeDigits } from '../../utils/format';
import { tap as hapticTap, success as hapticSuccess } from '../../utils/haptics';
import { voice as soundVoice, feed as soundFeed, happy as soundHappy } from '../../utils/sound';

// The animal's own place: it stands in its habitat, you can talk to it, and you
// can give it something to eat.
//
// What this screen deliberately does NOT have, and must never grow:
//
//   a hunger bar        — the animal is never hungry, so it can never be
//                         neglected, so you can never be failing it
//   a timer             — "last fed 3 days ago" is a guilt counter with a
//                         friendly font
//   a limited supply    — treats are unlimited; scarcity would turn a toy into
//                         a resource to manage
//   a notification      — the animal never asks to be visited
//
// Feeding is worth exactly one thing: the animal is visibly delighted, and a
// number that only ever goes up goes up. That is the same deal the whole Calm
// Corner offers (see utils/calmData.js), and the reason it works for someone on
// a bad day is that skipping it costs nothing at all.

const TREATS = [
  { id: 'berry', icon: 'nutrition', tint: '#E2A0A0' },
  { id: 'leaf', icon: 'leaf', tint: '#8CBE9B' },
  { id: 'honey', icon: 'water', tint: '#DDBB94' },
  { id: 'flower', icon: 'flower', tint: '#B9B1DC' },
];

const PET_SIZE = 168;

/** A heart floating off the animal when it is pleased. */
function Heart({ seed, onDone }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(value, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(onDone);
  }, []);

  const drift = (seed % 2 ? 1 : -1) * (14 + (seed % 3) * 10);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        opacity: value.interpolate({ inputRange: [0, 0.2, 0.75, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -86] }) },
          { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
          { scale: value.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.85] }) },
        ],
      }}
    >
      <Ionicons name="heart" size={17 + (seed % 3) * 3} color="#E2757B" />
    </Animated.View>
  );
}

export default function SpiritHomeScreen({ navigation }) {
  const { t, lang } = useI18n();
  const id = useSpirit((s) => s.id);
  const bond = useSpirit((s) => s.bond);
  const feed = useSpirit((s) => s.feed);
  const growth = useCalm((s) => s.growth);

  const [sceneH, setSceneH] = useState(320);
  const [eating, setEating] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [hearts, setHearts] = useState([]);
  const [flying, setFlying] = useState(null); // the treat currently in the air

  const fly = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const timers = useRef([]);

  const n = (v) => localizeDigits(v, lang);
  const spirit = spiritById(id);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Nothing routes here without a spirit, but a stale deep link or a cleared
  // store would render a screen addressed to nobody. Send them to meet one.
  useEffect(() => {
    if (!id) navigation.replace('SpiritQuiz');
  }, [id]);
  if (!id) return <Screen edges={['top', 'bottom']} />;
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // Nothing here can be lost, so nothing here needs an "are you sure". The only
  // guard is against double-taps landing two treats on one animation.
  const give = (treat) => {
    if (busy.current) return;
    busy.current = true;
    hapticTap();
    setFlying(treat);
    fly.setValue(0);

    Animated.timing(fly, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setFlying(null);
      setEating(true);
      soundFeed();

      later(() => {
        setEating(false);
        setPulse((p) => p + 1);
        hapticSuccess();
        soundHappy();
        feed();
        setHearts((h) => [...h, Date.now(), Date.now() + 1, Date.now() + 2]);
        busy.current = false;
      }, 900);
    });
  };

  const greet = () => {
    hapticTap();
    soundVoice(id);
    setPulse((p) => p + 1);
  };

  // Where the treat lands: the animal's head, measured up from the scene floor.
  const petHeadY = -(sceneH * 0.16 + PET_SIZE * 0.62);

  return (
    <Screen edges={['top', 'bottom']} bg={colors.bg}>
      <View style={{ flex: 1 }}>
        {/* The habitat. Same painted scene as the reveal, so the animal always
            turns up in the same place — it has an address, not a background. */}
        <View
          onLayout={(e) => setSceneH(Math.round(e.nativeEvent.layout.height))}
          style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.bgSoft }}
        >
          <Image
            source={habitatFor(id)}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            resizeMode="cover"
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,.16)', 'rgba(255,255,255,0)', 'rgba(20,32,40,.2)']}
            locations={[0, 0.5, 1]}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
            <BackButton onPress={() => navigation.goBack()} />
            <View style={{ flex: 1 }} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(255,255,255,.82)',
                borderRadius: 18,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="heart" size={14} color="#E2757B" />
              <T w="700" size={13} color="#3D5866">{n(bond)}</T>
            </View>
          </View>

          {/* The animal, standing on the floor of the scene. */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: sceneH * 0.06 }}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              {hearts.map((key) => (
                <Heart
                  key={key}
                  seed={key}
                  onDone={() => setHearts((h) => h.filter((k) => k !== key))}
                />
              ))}
              <Pressable onPress={greet} hitSlop={8}>
                <SpiritAnimal
                  id={id}
                  size={PET_SIZE}
                  points={growth}
                  pulseKey={pulse}
                  expression={eating ? 'eating' : 'idle'}
                  aura
                />
              </Pressable>
            </View>
          </View>

          {/* The treat in the air, arcing from the tray up to the animal. */}
          {flying && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: 8,
                alignSelf: 'center',
                opacity: fly.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, petHeadY] }) },
                  // a slight sideways arc, so it is thrown rather than teleported
                  { translateX: fly.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 26, 0] }) },
                  { scale: fly.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1.1, 0.7] }) },
                  { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '220deg'] }) },
                ],
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: flying.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={flying.icon} size={19} color="#FFFFFF" />
              </View>
            </Animated.View>
          )}
        </View>

        {/* The tray */}
        <View style={{ padding: 20, gap: 14, backgroundColor: colors.bg }}>
          <FadeIn index={0} style={{ gap: 3 }}>
            <T w="700" size={17}>{t('spirit.giveTreat')}</T>
            <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>
              {t('spirit.bondBody', { name: t(`spirit.animals.${id}.name`), n: n(bond) })}
            </T>
          </FadeIn>

          <FadeIn index={1} style={{ flexDirection: 'row', gap: 12 }}>
            {TREATS.map((treat) => (
              <Pressable
                key={treat.id}
                onPress={() => give(treat)}
                accessibilityLabel={t(`spirit.treats.${treat.id}`)}
                style={{ flex: 1, alignItems: 'center', gap: 7 }}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 20,
                    backgroundColor: treat.tint,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={treat.icon} size={26} color="#FFFFFF" />
                </View>
                <T size={11.5} color={colors.muted}>{t(`spirit.treats.${treat.id}`)}</T>
              </Pressable>
            ))}
          </FadeIn>

          {/* Said out loud, because it is the whole design and someone who has
              been burned by a pet app will be waiting for the catch. */}
          <FadeIn index={2}>
            <Card style={{ padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
              <Ionicons name="infinite-outline" size={18} color={colors.success} />
              <T size={12} color={colors.muted} style={{ flex: 1, lineHeight: 19 }}>
                {t('spirit.neverHungry', { name: t(`spirit.animals.${spirit.id}.name`) })}
              </T>
            </Card>
          </FadeIn>
        </View>
      </View>
    </Screen>
  );
}
