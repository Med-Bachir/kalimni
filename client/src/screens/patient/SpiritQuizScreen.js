import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Image, Switch } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button, BackButton, Card } from '../../components/ui';
import { FadeIn, PopIn, Pulse } from '../../components/motion';
import SpiritAnimal from '../../components/SpiritAnimal';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useSpirit } from '../../store/spirit';
import { useCalm } from '../../store/calm';
import { useSettings } from '../../store/settings';
import { SPIRIT_QUIZ, spiritById } from '../../utils/spiritData';
import { habitatFor } from '../../utils/spiritArt';
import { localizeDigits } from '../../utils/format';
import { tap as hapticTap, celebrate as hapticCelebrate } from '../../utils/haptics';
import { reveal as soundReveal } from '../../utils/sound';

// Meeting the spirit animal.
//
// Five questions about temperament, and it is worth being precise about why
// they are not the intake questions. GAD-7 and PHQ-9 measure severity — they
// have a scoring key and a clinical meaning — and turning a severity band into
// a cute animal would tell someone their depression has a mascot. These ask
// where you stand at a party and what rest sounds like. There is no wrong
// answer, no score, and no result that is worse than another result.
//
// The reveal is the one openly magical moment in the app, so it is allowed
// sound, haptics and a spring. Everything after it is quiet again.

const LETTERS = ['a', 'b', 'c', 'd'];

export default function SpiritQuizScreen({ navigation }) {
  const { t, lang } = useI18n();
  const discover = useSpirit((s) => s.discover);
  const existing = useSpirit((s) => s.id);
  const growth = useCalm((s) => s.growth);
  const companion = useSettings((s) => s.companion);
  const setCompanion = useSettings((s) => s.setCompanion);

  // -1 = intro, 0..4 = questions, SPIRIT_QUIZ.length = reveal
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState([]);
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null);
  const advanceTimer = useRef(null);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const n = (v) => localizeDigits(v, lang);
  const done = step >= SPIRIT_QUIZ.length;

  // The reveal fires exactly once, guarded like every other reward in the app
  // so a re-render (or the theme remounting the tree) cannot replay it.
  const revealed = useRef(false);
  useEffect(() => {
    if (!done || revealed.current) return;
    revealed.current = true;
    hapticCelebrate();
    soundReveal();
  }, [done]);

  const choose = (key) => {
    if (picked) return; // already answering; ignore double taps
    hapticTap();
    setPicked(key);
    const next = [...answers];
    next[step] = key;
    setAnswers(next);

    // A beat so the selection is visible before the question changes —
    // the same 380ms pause GroundingScreen uses between steps.
    advanceTimer.current = setTimeout(() => {
      setPicked(null);
      if (step < SPIRIT_QUIZ.length - 1) {
        setStep(step + 1);
      } else {
        setResult(discover(next));
        setStep(SPIRIT_QUIZ.length);
      }
    }, 380);
  };

  const back = () => {
    clearTimeout(advanceTimer.current);
    setPicked(null);
    if (step > 0) setStep(step - 1);
    else if (navigation.canGoBack()) navigation.goBack();
    else setStep(-1);
  };

  const restart = () => {
    revealed.current = false;
    setAnswers([]);
    setPicked(null);
    setResult(null);
    setStep(0);
  };

  // --- intro -----------------------------------------------------------------

  if (step === -1) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 22 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BackButton onPress={() => navigation.goBack()} />
            <T w="700" size={18} style={{ flex: 1 }}>{t('spirit.title')}</T>
          </View>

          <FadeIn index={1} style={{ alignItems: 'center', gap: 6, paddingVertical: 6 }}>
            {/* Three of the six, faded — enough to show what is coming without
                showing which one they are going to get. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <SpiritAnimal id="deer" size={86} aura={false} style={{ opacity: 0.4, marginEnd: -18 }} />
              <SpiritAnimal id="owl" size={112} aura />
              <SpiritAnimal id="fox" size={86} aura={false} style={{ opacity: 0.4, marginStart: -18 }} />
            </View>
          </FadeIn>

          <FadeIn index={2} style={{ gap: 12 }}>
            <T w="700" size={22} style={{ lineHeight: 34 }}>{t('spirit.introTitle')}</T>
            <T size={14} color={colors.muted} style={{ lineHeight: 24 }}>{t('spirit.introBody')}</T>
          </FadeIn>

          <FadeIn index={3}>
            <Card style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Ionicons name="shield-checkmark-outline" size={19} color={colors.success} />
              <T size={12.5} color={colors.muted} style={{ flex: 1, lineHeight: 21 }}>{t('spirit.introNote')}</T>
            </Card>
          </FadeIn>

          <View style={{ flex: 1 }} />
          <FadeIn index={4} style={{ gap: 10 }}>
            <Button title={t(existing ? 'spirit.beginAgain' : 'spirit.begin')} onPress={() => { hapticTap(); setStep(0); }} />
          </FadeIn>
        </ScrollView>
      </Screen>
    );
  }

  // --- reveal ----------------------------------------------------------------

  if (done) {
    const spirit = spiritById(result || existing);
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 18 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <T w="600" size={13} color={colors.faint}>{t('spirit.revealKicker')}</T>

            {/* The animal standing in its own place. The scene is painted art
                (utils/spiritArt) because atmospheric haze is the one thing the
                View-drawn approach genuinely cannot do; the animal on top of it
                is still the same code-drawn creature as everywhere else, still
                breathing and blinking. A static picture of an animal is a
                picture — this has to be company. */}
            <View
              style={{
                width: '100%',
                height: 248,
                borderRadius: 22,
                overflow: 'hidden',
                backgroundColor: colors.bgSoft,
              }}
            >
              <Image
                source={habitatFor(spirit.id)}
                style={{ position: 'absolute', width: '100%', height: '100%' }}
                resizeMode="cover"
              />
              {/* Lifts the top, settles the base — keeps the creature from
                  disappearing into a scene of similar value. */}
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,.14)', 'rgba(255,255,255,0)', 'rgba(20,32,40,.18)']}
                locations={[0, 0.55, 1]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 }}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Pulse size={170} color={spirit.palette.aura} />
                  <PopIn>
                    <SpiritAnimal id={spirit.id} size={170} mood="happy" points={growth} />
                  </PopIn>
                </View>
              </View>
            </View>

            <PopIn delay={220} style={{ alignItems: 'center', gap: 7 }}>
              <T w="700" size={26}>{t(`spirit.animals.${spirit.id}.name`)}</T>
              <T w="600" size={14} color={colors.primary}>{t(`spirit.animals.${spirit.id}.trait`)}</T>
              <T size={12} color={colors.faint} style={{ marginTop: 2 }}>
                {t('spirit.habitat', { name: t(`spirit.animals.${spirit.id}.name`) })}
              </T>
            </PopIn>
          </View>

          <FadeIn index={3}>
            <Card style={{ padding: 18 }}>
              <T size={14} color={colors.body} style={{ lineHeight: 25 }}>
                {t(`spirit.animals.${spirit.id}.body`)}
              </T>
            </Card>
          </FadeIn>

          {/* Asked, not assumed.
              An animal that walks across every screen is the most opinionated
              thing in this app: delightful for most people, and genuinely
              intolerable for some — and "some" here means people who are
              already struggling and did not ask for a cartoon in their therapy
              app. Defaulting to yes but showing the switch at the moment the
              animal appears costs one row, and turns the one design decision
              most likely to make somebody uninstall into a decision they made
              themselves. */}
          <FadeIn index={4}>
            <Card style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Ionicons name="footsteps-outline" size={19} color={colors.primary} />
              <View style={{ flex: 1, gap: 3 }}>
                <T w="600" size={14}>
                  {t('spirit.followTitle', { name: t(`spirit.animals.${spirit.id}.name`) })}
                </T>
                <T size={12} color={colors.muted} style={{ lineHeight: 19 }}>{t('spirit.followBody')}</T>
              </View>
              <Switch
                value={companion}
                onValueChange={(v) => { hapticTap(); setCompanion(v); }}
                trackColor={{ false: colors.track, true: colors.primary }}
                thumbColor="#fff"
              />
            </Card>
          </FadeIn>

          <FadeIn index={5}>
            <Card style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Ionicons name="infinite-outline" size={19} color={colors.primary} />
              <T size={12.5} color={colors.muted} style={{ flex: 1, lineHeight: 21 }}>{t('spirit.promise')}</T>
            </Card>
          </FadeIn>

          <View style={{ flex: 1 }} />
          <FadeIn index={6} style={{ gap: 10 }}>
            <Button title={t('spirit.keep')} onPress={() => { hapticTap(); navigation.goBack(); }} />
            <Pressable onPress={() => { hapticTap(); restart(); }} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <T w="600" size={13.5} color={colors.muted}>{t('spirit.retake')}</T>
            </Pressable>
          </FadeIn>
        </ScrollView>
      </Screen>
    );
  }

  // --- questions -------------------------------------------------------------

  const question = SPIRIT_QUIZ[step];

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: 24, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton onPress={back} />
          <T w="600" size={14} color={colors.muted}>
            {t('spirit.questionOf', { n: n(step + 1), total: n(SPIRIT_QUIZ.length) })}
          </T>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SPIRIT_QUIZ.map((_, i) => (
            <View
              key={i}
              style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.primary : colors.track }}
            />
          ))}
        </View>

        <T w="700" size={22} style={{ lineHeight: 36, marginTop: 4 }}>
          {t(`spirit.quiz.${question.id}.q`)}
        </T>

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          {question.options.map((option, i) => {
            const active = picked === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => choose(option.key)}
                style={{
                  minHeight: 64,
                  borderRadius: 16,
                  paddingHorizontal: 18,
                  paddingVertical: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: active ? colors.bgSoft : colors.card,
                  borderWidth: active ? 2 : 1.5,
                  borderColor: active ? colors.primary : colors.inputBorder,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.primary : colors.bgSoft,
                  }}
                >
                  {active ? (
                    <Ionicons name="checkmark" size={15} color="#fff" />
                  ) : (
                    <T w="700" size={12} color={colors.faint}>{LETTERS[i].toUpperCase()}</T>
                  )}
                </View>
                <T
                  w={active ? '600' : '500'}
                  size={15}
                  color={active ? colors.primaryDark : colors.ink}
                  style={{ flex: 1, lineHeight: 24 }}
                >
                  {t(`spirit.quiz.${question.id}.${option.key}`)}
                </T>
              </Pressable>
            );
          })}
        </ScrollView>

        <T size={12} color={colors.faint} style={{ textAlign: 'center', lineHeight: 19 }}>
          {t('spirit.noWrongAnswer')}
        </T>
      </View>
    </Screen>
  );
}
