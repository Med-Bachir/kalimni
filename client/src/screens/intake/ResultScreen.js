import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button, Card, LevelBadge } from '../../components/ui';
import { colors, severityColors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { localizeDigits } from '../../utils/format';

const MAX_SCORE = { gad7: 21, phq9: 27 };

export default function ResultScreen({ navigation, route }) {
  const { result, questionnaireId, retake } = route.params;
  const { t, lang, L } = useI18n();
  const { fg, bg } = severityColors(result.level);

  // GAD-7 flows into PHQ-9 during first intake; a retake runs one at a time.
  const nextId = !retake && questionnaireId === 'gad7' ? 'phq9' : null;

  const finish = () => {
    navigation.reset({ index: 0, routes: [{ name: 'PatientTabs' }] });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 18, flexGrow: 1 }}>
        <View style={{ alignItems: 'center', gap: 16, marginTop: 24 }}>
          <View style={{
            width: 132, height: 132, borderRadius: 66, backgroundColor: bg,
            alignItems: 'center', justifyContent: 'center', gap: 2,
          }}>
            <T w="700" size={40} color={fg}>{localizeDigits(result.score, lang)}</T>
            <T w="600" size={12.5} color={fg}>
              {t('intake.scoreOf', {
                score: localizeDigits(result.score, lang),
                max: localizeDigits(MAX_SCORE[questionnaireId], lang),
              })}
            </T>
          </View>
          <T w="700" size={24}>{t('intake.resultTitle')}</T>
          <LevelBadge label={L(result.label)} level={result.level} />
        </View>

        <Card style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
          <T size={13.5} color={colors.body} style={{ flex: 1, lineHeight: 23 }}>{t('intake.resultNote')}</T>
        </Card>
        {!retake && (
          <Card style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Ionicons name="people-outline" size={22} color={colors.primary} />
            <T size={13.5} color={colors.body} style={{ flex: 1, lineHeight: 23 }}>{t('intake.matchNote')}</T>
          </Card>
        )}

        {result.crisisFlag && (
          <Card style={{ padding: 16, gap: 10, borderColor: colors.dangerBorder, backgroundColor: '#FFF9F8' }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="heart" size={20} color={colors.dangerDark} />
              <T w="700" size={15} color={colors.dangerDark}>{t('intake.crisisTitle')}</T>
            </View>
            <T size={13.5} color={colors.body} style={{ lineHeight: 23 }}>{t('intake.crisisBody')}</T>
            <Button
              title={t('disclaimer.crisisCta')} variant="danger" style={{ height: 48 }}
              onPress={() => navigation.navigate('Crisis')}
            />
          </Card>
        )}

        <View style={{ marginTop: 'auto', gap: 12 }}>
          {nextId ? (
            <Button
              title={t('intake.continueNext')}
              onPress={() => navigation.replace('Questionnaire', { questionnaireId: nextId })}
            />
          ) : (
            <Button title={t('intake.finish')} onPress={finish} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
