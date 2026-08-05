import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, Card } from './ui';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n';
import { formatDate } from '../utils/format';

// Session Witness on the specialist's side (Phase 2.3).
//
// Everything below was chosen by the patient. What is missing was not hidden
// by the software — the items they did not tick were deleted when they pressed
// send, so there is nothing withheld to go looking for. The `locked` safety
// item is the one exception and is labelled as such on both screens.
//
// Read-only on purpose: a brief is a message from a patient, not a form.

const ORDER = ['notes', 'takeaway', 'checkins', 'themes', 'exercises', 'safety'];

export default function BriefCard({ briefs }) {
  const { t, lang } = useI18n();
  if (!briefs?.length) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="mail-open-outline" size={18} color={colors.primary} />
        <T w="700" size={17} style={{ flex: 1 }}>{t('witnessSpecialist.title')}</T>
      </View>
      <T size={12} color={colors.muted} style={{ lineHeight: 19 }}>
        {t('witnessSpecialist.hint')}
      </T>

      {briefs.slice(0, 3).map((brief) => {
        const items = [...(brief.items || [])].sort(
          (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)
        );
        return (
          <Card key={brief.id} style={{ padding: 14, gap: 12 }}>
            <T size={12} color={colors.faint}>{formatDate(brief.sharedAt || brief.createdAt, lang)}</T>

            {items.map((item) => (
              <View key={item.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <T w="700" size={13} color={colors.muted}>
                    {item.title?.[lang] || item.title?.ar || item.id}
                  </T>
                  {item.locked && (
                    <T size={11} w="600" color={colors.warn}>· {t('witnessSpecialist.alwaysShared')}</T>
                  )}
                  {item.patientAuthored && (
                    <T size={11} w="600" color={colors.primary}>· {t('witnessSpecialist.theirWords')}</T>
                  )}
                </View>
                <T size={13.5} style={{ lineHeight: 22 }}>{item.body}</T>
              </View>
            ))}

            {brief.takeaway ? (
              <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                <T w="700" size={13} color={colors.muted}>{t('witnessSpecialist.takeaway')}</T>
                <T size={13.5} style={{ lineHeight: 22 }}>{brief.takeaway}</T>
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
