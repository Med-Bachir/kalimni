import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { useCalm } from '../store/calm';
import { questsFor, dayKey } from '../utils/calmData';
import { tap as hapticTap, success as hapticSuccess } from '../utils/haptics';

// Three small kindnesses, offered once a day.
//
// Everything about the framing is chosen to survive a bad day:
//   - the bar is "possible when you feel terrible", not "aspirational"
//   - untouched quests just quietly don't come back; nothing is failed
//   - there is no timer, no lost progress, no "you missed 4 days" anywhere
//   - completing one is worth exactly one growth point, same as everything else
//
// The counter shown is "n of 3 today", never a percentage and never a streak.

export default function QuestsCard({ compact }) {
  const { t } = useI18n();
  // Read the log through the hook, not getState() — the subscription is what
  // re-renders the row the instant a quest is ticked.
  const questLog = useCalm((s) => s.questLog);
  const toggleQuest = useCalm((s) => s.toggleQuest);

  const quests = questsFor();
  const today = questLog[dayKey()] || [];
  const completed = quests.filter((q) => today.includes(q.id)).length;

  const onToggle = (id) => {
    const nowDone = toggleQuest(id);
    if (nowDone) hapticSuccess();
    else hapticTap();
  };

  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <T w="700" size={15.5}>{t('quests.title')}</T>
          {!compact && (
            <T size={12.5} color={colors.muted} style={{ lineHeight: 20 }}>{t('quests.subtitle')}</T>
          )}
        </View>
        <T size={12.5} w="600" color={colors.faint}>
          {t('quests.count', { done: completed, total: quests.length })}
        </T>
      </View>

      <View style={{ gap: 8 }}>
        {quests.map((q) => {
          const isDone = today.includes(q.id);
          return (
            <Pressable
              key={q.id}
              onPress={() => onToggle(q.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isDone }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13,
                backgroundColor: isDone ? colors.successBg : colors.bgSoft,
              }}
            >
              <View
                style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: isDone ? colors.success : colors.card,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={isDone ? 'checkmark' : q.icon}
                  size={17}
                  color={isDone ? '#FFFFFF' : colors.primary}
                />
              </View>
              <T
                w={isDone ? '600' : '500'}
                size={14}
                color={isDone ? colors.success : colors.ink}
                style={{ flex: 1, lineHeight: 21 }}
              >
                {t(`quests.items.${q.id}`)}
              </T>
            </Pressable>
          );
        })}
      </View>

      {completed === quests.length && (
        <T size={12.5} color={colors.success} w="600" style={{ lineHeight: 20 }}>
          {t('quests.allDone')}
        </T>
      )}
      {completed === 0 && !compact && (
        <T size={12} color={colors.faint} style={{ lineHeight: 19 }}>{t('quests.noPressure')}</T>
      )}
    </Card>
  );
}
