import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Button, Card } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';

// Shown once after patient signup, before the intake questionnaire.
export default function DisclaimerScreen({ navigation }) {
  const { t } = useI18n();

  const Item = ({ icon, text, tint }) => (
    <Card style={{ padding: 16, flexDirection: 'row', gap: 13, alignItems: 'center' }}>
      <View style={{
        width: 42, height: 42, borderRadius: 12, backgroundColor: tint || colors.bgSoft,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon} size={21} color={tint ? colors.dangerDark : colors.primary} />
      </View>
      <T size={14} color={colors.body} style={{ flex: 1, lineHeight: 24 }}>{text}</T>
    </Card>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14, flexGrow: 1 }}>
        <T w="700" size={24} style={{ marginTop: 10 }}>{t('disclaimer.title')}</T>
        <Item icon="information-circle-outline" text={t('disclaimer.body')} />
        <Item icon="lock-closed-outline" text={t('disclaimer.confidential')} />
        <Item icon="warning-outline" text={t('disclaimer.emergencyNote')} tint={colors.dangerBg} />
        <Button
          title={t('disclaimer.crisisCta')} variant="danger"
          onPress={() => navigation.navigate('Crisis')}
          style={{ height: 52 }}
        />
        <View style={{ marginTop: 'auto' }}>
          <Button title={t('disclaimer.accept')} onPress={() => navigation.navigate('Questionnaire', { questionnaireId: 'gad7' })} />
        </View>
      </ScrollView>
    </Screen>
  );
}
