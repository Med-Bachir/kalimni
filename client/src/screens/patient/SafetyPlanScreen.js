import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, Linking, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, T, Card, BackButton } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { useSafetyPlan, DEFAULT_PROFESSIONALS } from '../../store/safetyPlan';
import { localizeDigits } from '../../utils/format';

// The patient's own Safety Plan (Stanley-Brown), written while calm, read on
// the worst day. Device-local: nothing on this screen touches the network.
// Everything autosaves on each add/remove — no save button to forget.
//
// Worst-day ergonomics: one thing per row, large targets, no required fields,
// no validation lectures. Adding a single line already counts as a plan.

const SECTION_META = {
  warningSigns: { icon: 'eye-outline' },
  copingAlone: { icon: 'leaf-outline' },
  distractions: { icon: 'walk-outline' },
  contacts: { icon: 'people-outline', contact: true },
  professionals: { icon: 'medkit-outline', contact: true },
  environmentSafety: { icon: 'shield-checkmark-outline' },
};
const SECTION_ORDER = ['warningSigns', 'copingAlone', 'distractions', 'contacts', 'professionals', 'environmentSafety'];

function TextSection({ section, items, t }) {
  const addItem = useSafetyPlan((s) => s.addItem);
  const removeItem = useSafetyPlan((s) => s.removeItem);
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    addItem(section, value);
    setDraft('');
  };

  return (
    <>
      {items.map((item, i) => (
        <View key={`${section}-${i}`} style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.bgSoft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
        }}>
          <T size={14} style={{ flex: 1, lineHeight: 22 }}>{item}</T>
          <TouchableOpacity onPress={() => removeItem(section, i)} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={colors.faint} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={t(`safetyPlan.${section}Placeholder`)}
          placeholderTextColor={colors.faint}
          style={{
            flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.card,
            borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14,
            fontSize: 14, color: colors.ink, fontFamily: 'IBMPlexSansArabic_400Regular',
            textAlign: I18nManager.isRTL ? 'right' : 'left',
          }}
        />
        <TouchableOpacity
          onPress={add}
          style={{
            width: 48, height: 48, borderRadius: 12, backgroundColor: draft.trim() ? colors.primary : colors.track,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </>
  );
}

function ContactSection({ section, items, t, lang }) {
  const addItem = useSafetyPlan((s) => s.addItem);
  const removeItem = useSafetyPlan((s) => s.removeItem);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const add = () => {
    if (!name.trim()) return;
    addItem(section, { name: name.trim(), phone: phone.trim() || null });
    setName('');
    setPhone('');
  };

  const inputStyle = {
    minHeight: 48, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14,
    fontSize: 14, color: colors.ink, fontFamily: 'IBMPlexSansArabic_400Regular',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  };

  return (
    <>
      {items.map((c, i) => (
        <View key={`${section}-${i}`} style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.bgSoft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
        }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="600" size={14}>{c.name}</T>
            {c.phone ? <T size={12.5} color={colors.muted}>{localizeDigits(c.phone, lang)}</T> : null}
          </View>
          {c.phone ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${c.phone}`)}
              style={{
                width: 44, height: 44, borderRadius: 12, backgroundColor: colors.successBg,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="call" size={19} color={colors.success} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => removeItem(section, i)} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={colors.faint} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={{ gap: 8 }}>
        <TextInput
          value={name} onChangeText={setName}
          placeholder={t('safetyPlan.contactName')} placeholderTextColor={colors.faint}
          style={inputStyle}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={phone} onChangeText={setPhone} keyboardType="phone-pad"
            placeholder={t('safetyPlan.contactPhone')} placeholderTextColor={colors.faint}
            style={[inputStyle, { flex: 1 }]}
          />
          <TouchableOpacity
            onPress={add}
            style={{
              width: 48, height: 48, borderRadius: 12, backgroundColor: name.trim() ? colors.primary : colors.track,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

export default function SafetyPlanScreen({ navigation }) {
  const { t, lang } = useI18n();
  const plan = useSafetyPlan((s) => s.plan);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <T w="700" size={22}>{t('safetyPlan.title')}</T>
        </View>

        <Card style={{ padding: 16, gap: 8, backgroundColor: colors.bgSoft, borderColor: colors.bgSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="phone-portrait-outline" size={17} color={colors.primary} />
            <T w="700" size={13.5} color={colors.primary}>{t('safetyPlan.localTitle')}</T>
          </View>
          <T size={13} color={colors.body} style={{ lineHeight: 21 }}>{t('safetyPlan.intro')}</T>
        </Card>

        {SECTION_ORDER.map((section) => {
          const meta = SECTION_META[section];
          // Before the first write the plan is null — the professionals
          // pre-fill (national numbers) still shows, matching what the store
          // seeds on creation.
          const items = plan?.[section] || (section === 'professionals' ? DEFAULT_PROFESSIONALS : []);
          return (
            <View key={section} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{
                  width: 34, height: 34, borderRadius: 10, backgroundColor: colors.bgSoft,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={meta.icon} size={17} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T w="700" size={15.5}>{t(`safetyPlan.${section}`)}</T>
                  <T size={12} color={colors.muted} style={{ lineHeight: 17 }}>{t(`safetyPlan.${section}Hint`)}</T>
                </View>
              </View>
              {meta.contact
                ? <ContactSection section={section} items={items} t={t} lang={lang} />
                : <TextSection section={section} items={items} t={t} />}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
