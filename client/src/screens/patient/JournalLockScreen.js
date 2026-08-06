import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, Alert, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Card, BackButton, Button, LoadingView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useJournalLock } from '../../store/journalLock';

// Locking the journal (Phase 2.5).
//
// This screen's whole job is informed consent about two costs, and it refuses
// to be cheerful about either:
//
//   1. RECOVERY. If the phrase is lost with the phone, the entries are gone.
//      Not "contact support" — gone. That sentence is on the screen before the
//      button, and the phrase must be confirmed before the lock engages,
//      because a phrase nobody wrote down is not recovery.
//   2. THE SAFETY SCAN. Locked entries are still checked for crisis content
//      before they are sealed, which means the text passes through the server
//      once, unstored, for that check. Saying nothing here would be the more
//      comfortable choice and the dishonest one.
//
// Neither cost is hidden behind a "learn more".

const OPTIONS = [
  { method: 'phrase', icon: 'key-outline', recommended: true },
  { method: 'none', icon: 'phone-portrait-outline' },
];

export default function JournalLockScreen({ navigation }) {
  const { t } = useI18n();
  const status = useJournalLock((s) => s.status);
  const method = useJournalLock((s) => s.method);
  const hydrate = useJournalLock((s) => s.hydrate);
  const unavailable = useJournalLock((s) => s.unavailable);
  const enable = useJournalLock((s) => s.enable);
  const restore = useJournalLock((s) => s.restore);

  const [choice, setChoice] = useState('phrase');
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState(null);      // shown once, after enabling
  const [confirmed, setConfirmed] = useState(false);
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreError, setRestoreError] = useState(false);

  useEffect(() => { hydrate(); }, [hydrate]);

  if (status === 'unknown' && !unavailable) return <LoadingView />;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton onPress={() => navigation.goBack()} />
      <T w="700" size={22} style={{ flex: 1 }}>{t('journalLock.title')}</T>
    </View>
  );

  const turnOn = async () => {
    setBusy(true);
    try {
      const generated = await enable({ method: choice });
      if (generated) setPhrase(generated);
      else Alert.alert(t('journalLock.onTitle'), t('journalLock.onBodyDeviceOnly'));
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.networkError'));
    } finally {
      setBusy(false);
    }
  };

  const tryRestore = async () => {
    setBusy(true);
    setRestoreError(false);
    const ok = await restore({ phrase: restoreInput });
    setBusy(false);
    if (!ok) return setRestoreError(true);
    Alert.alert(t('journalLock.restoredTitle'), t('journalLock.restoredBody'));
    navigation.goBack();
  };

  const inputStyle = {
    minHeight: 110, borderRadius: 14, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.inputBorder, padding: 14,
    fontSize: 15, lineHeight: 25, color: colors.ink,
    fontFamily: 'IBMPlexSansArabic_400Regular',
    textAlign: 'left', textAlignVertical: 'top',
  };

  // --- encryption is not available on this build --------------------------------
  // Better an explanation than a button that does nothing. Notes keep saving
  // the way they always did, and the screen says so rather than leaving the
  // patient to guess whether their journal is protected.
  if (unavailable) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
          {header}
          <Card style={{ padding: 20, gap: 10, alignItems: 'center' }}>
            <Ionicons name="cloud-offline-outline" size={38} color={colors.faint} />
            <T w="700" size={16}>{t('journalLock.unavailableTitle')}</T>
            <T size={13.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 22 }}>
              {t('journalLock.unavailableBody')}
            </T>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  // --- the phrase, shown exactly once -------------------------------------------
  if (phrase) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
          <T w="700" size={22}>{t('journalLock.phraseTitle')}</T>
          <Card style={{ padding: 16, gap: 8, backgroundColor: colors.warnBg, borderColor: colors.warnBg }}>
            <T size={13.5} color={colors.warn} style={{ lineHeight: 22 }}>{t('journalLock.phraseWarning')}</T>
          </Card>

          <Card style={{ padding: 18 }}>
            <T
              w="600" size={16}
              style={{ lineHeight: 30, textAlign: 'left', writingDirection: 'ltr' }}
            >
              {phrase}
            </T>
          </Card>

          <TouchableOpacity
            onPress={() => setConfirmed((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
          >
            <Ionicons
              name={confirmed ? 'checkbox' : 'square-outline'}
              size={24} color={confirmed ? colors.primary : colors.faint}
            />
            <T size={13.5} style={{ flex: 1, lineHeight: 22 }}>{t('journalLock.phraseConfirm')}</T>
          </TouchableOpacity>

          <Button
            title={t('journalLock.phraseDone')}
            disabled={!confirmed}
            onPress={() => { setPhrase(null); navigation.goBack(); }}
          />
        </ScrollView>
      </Screen>
    );
  }

  // --- this device has no key, but the account has a lock -------------------------
  if (status === 'needsRestore') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} keyboardShouldPersistTaps="handled">
          {header}
          <Card style={{ padding: 16, gap: 8, backgroundColor: colors.bgSoft, borderColor: colors.bgSoft }}>
            <T size={13.5} color={colors.body} style={{ lineHeight: 22 }}>{t('journalLock.restoreIntro')}</T>
          </Card>
          <TextInput
            value={restoreInput}
            onChangeText={(v) => { setRestoreInput(v); setRestoreError(false); }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('journalLock.restorePlaceholder')}
            placeholderTextColor={colors.faint}
            style={inputStyle}
          />
          {restoreError && (
            <T size={13} color={colors.dangerDark} style={{ lineHeight: 21 }}>{t('journalLock.restoreWrong')}</T>
          )}
          <Button
            title={t('journalLock.restoreCta')}
            loading={busy}
            disabled={restoreInput.trim().split(/\s+/).length < 4}
            onPress={tryRestore}
          />
          <T size={12} color={colors.faint} style={{ lineHeight: 19 }}>{t('journalLock.restoreNote')}</T>
        </ScrollView>
      </Screen>
    );
  }

  // --- already on -----------------------------------------------------------------
  if (status === 'on') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
          {header}
          <Card style={{ padding: 18, gap: 10, alignItems: 'center' }}>
            <Ionicons name="lock-closed" size={36} color={colors.success} />
            <T w="700" size={16}>{t('journalLock.onTitle')}</T>
            <T size={13.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 22 }}>
              {method === 'none' ? t('journalLock.onBodyDeviceOnly') : t('journalLock.onBody')}
            </T>
          </Card>
          <View style={{ gap: 8 }}>
            <T size={12.5} color={colors.faint} style={{ lineHeight: 20 }}>{t('journalLock.noteScan')}</T>
            <T size={12.5} color={colors.faint} style={{ lineHeight: 20 }}>{t('journalLock.noteSpecialist')}</T>
            <T size={12.5} color={colors.faint} style={{ lineHeight: 20 }}>{t('journalLock.noteOlder')}</T>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // --- off: the choice ---------------------------------------------------------------
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
        {header}

        <Card style={{ padding: 16, gap: 8, backgroundColor: colors.bgSoft, borderColor: colors.bgSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="lock-closed-outline" size={17} color={colors.primary} />
            <T w="700" size={13.5} color={colors.primary}>{t('journalLock.introTitle')}</T>
          </View>
          <T size={13} color={colors.body} style={{ lineHeight: 21 }}>{t('journalLock.intro')}</T>
        </Card>

        <T w="700" size={15.5}>{t('journalLock.chooseTitle')}</T>
        {OPTIONS.map((opt) => {
          const active = choice === opt.method;
          return (
            <TouchableOpacity key={opt.method} onPress={() => setChoice(opt.method)} activeOpacity={0.85}>
              <Card style={{
                padding: 15, gap: 8,
                borderColor: active ? colors.primary : colors.border,
                borderWidth: active ? 2 : 1,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={opt.icon} size={19} color={active ? colors.primary : colors.muted} />
                  <T w="700" size={14.5} style={{ flex: 1 }}>{t(`journalLock.${opt.method}Title`)}</T>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={21} color={active ? colors.primary : colors.faint}
                  />
                </View>
                <T size={13} color={colors.body} style={{ lineHeight: 21 }}>
                  {t(`journalLock.${opt.method}Body`)}
                </T>
                {/* The cost, in the same size as the benefit. */}
                <T size={12.5} color={colors.dangerDark} style={{ lineHeight: 20 }}>
                  {t(`journalLock.${opt.method}Cost`)}
                </T>
              </Card>
            </TouchableOpacity>
          );
        })}

        <Card style={{ padding: 15, gap: 8, backgroundColor: colors.warnBg, borderColor: colors.warnBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={17} color={colors.warn} />
            <T w="700" size={13} color={colors.warn}>{t('journalLock.scanTitle')}</T>
          </View>
          <T size={12.5} color={colors.warn} style={{ lineHeight: 21 }}>{t('journalLock.scanBody')}</T>
        </Card>

        <Button title={t('journalLock.enable')} loading={busy} onPress={turnOn} />
        <T size={12} color={colors.faint} style={{ textAlign: 'center', lineHeight: 19 }}>
          {t('journalLock.footer')}
        </T>
      </ScrollView>
    </Screen>
  );
}
