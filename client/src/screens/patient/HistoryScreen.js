import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Screen, T, Card, Button, BackButton, LevelBadge, LoadingView, ErrorView } from '../../components/ui';
import ScoreTrendChart from '../../components/ScoreTrendChart';
import MoodTrend from '../../components/MoodTrend';
import JourneyCard from '../../components/JourneyCard';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { formatDate, localizeDigits } from '../../utils/format';

const CODES = { gad7: 'GAD-7', phq9: 'PHQ-9' };
const MAX_SCORES = { gad7: 21, phq9: 27 };

// Re-administering PHQ-9/GAD-7 every two weeks is standard measurement-based
// care; past that window we nudge the patient to re-check.
export const CHECKIN_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

export const checkinDue = (results) => {
  if (!results || results.length === 0) return false;
  const newest = results.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), results[0].createdAt);
  return Date.now() - new Date(newest).getTime() > CHECKIN_INTERVAL_MS;
};

export default function HistoryScreen({ navigation }) {
  const { t, lang, L } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['history'],
    queryFn: () => api('/questionnaires/history'),
  });
  // Same query key the home screen and DailyCheckin use.
  const { data: checkinData, isLoading: checkinsLoading } = useQuery({
    queryKey: ['checkins'],
    queryFn: () => api('/ai/checkins'),
  });

  if (isLoading || checkinsLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const results = data.results || [];
  const due = checkinDue(results);
  const entries = checkinData?.entries || [];
  const notes = entries.filter((e) => e.note).slice(0, 5);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14, flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('history.title')}</T>
        </View>

        {due && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.warnBg, borderRadius: 14, padding: 14,
          }}>
            <Ionicons name="time-outline" size={19} color={colors.warn} />
            <T size={13} color={colors.warn} style={{ flex: 1, lineHeight: 20 }}>
              {t('history.checkinDue')}
            </T>
          </View>
        )}

        {/* Daily check-ins: the data the patient enters most often, so it
            leads. Empty until they've logged at least one day. */}
        {entries.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <T size={13.5} color={colors.muted} style={{ lineHeight: 22 }}>{t('trend.empty')}</T>
          </Card>
        ) : (
          <>
            <JourneyCard total={checkinData?.total ?? entries.length} />
            <MoodTrend entries={entries} />
          </>
        )}

        {notes.length > 0 && (
          <View style={{ gap: 10 }}>
            <T w="700" size={17}>{t('trend.notesTitle')}</T>
            {notes.map((e) => (
              <Card key={e.id} style={{ padding: 14, gap: 6 }}>
                <T size={11.5} color={colors.faint}>{formatDate(e.createdAt, lang)}</T>
                <T size={13.5} color={colors.body} style={{ lineHeight: 22 }}>{e.note}</T>
              </Card>
            ))}
          </View>
        )}

        <T w="700" size={17} style={{ marginTop: 6 }}>{t('history.questionnaireSection')}</T>

        {results.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <T size={13.5} color={colors.muted} style={{ lineHeight: 22 }}>{t('history.empty')}</T>
          </Card>
        ) : (
          <View style={{ gap: 14 }}>
            {/* Trend per instrument */}
            {['gad7', 'phq9'].map((qid) => {
              const own = results.filter((r) => r.questionnaireId === qid);
              return own.length > 0 ? (
                <ScoreTrendChart key={qid} code={CODES[qid]} results={own} maxScore={MAX_SCORES[qid]} />
              ) : null;
            })}

            {/* Attempt-by-attempt detail */}
            <View style={{ gap: 10 }}>
              {results.map((r) => (
                <Card key={r.id} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <T w="700" size={15}>{CODES[r.questionnaireId] || r.questionnaireId}</T>
                    <T size={12.5} color={colors.muted}>
                      {t('specialist.score', { score: localizeDigits(r.score, lang) })} · {formatDate(r.createdAt, lang)}
                    </T>
                  </View>
                  <LevelBadge label={L(r.label)} level={r.level} />
                </Card>
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 'auto', gap: 10 }}>
          <Button
            title={`${t('history.retake')} — GAD-7`}
            variant="outline" style={{ height: 52 }}
            onPress={() => navigation.navigate('Questionnaire', { questionnaireId: 'gad7', retake: true })}
          />
          <Button
            title={`${t('history.retake')} — PHQ-9`}
            variant="outline" style={{ height: 52 }}
            onPress={() => navigation.navigate('Questionnaire', { questionnaireId: 'phq9', retake: true })}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
