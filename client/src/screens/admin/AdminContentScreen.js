import React, { useState } from 'react';
import { View, ScrollView, Modal, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, T, Card, Chip, Button, Input, LoadingView, ErrorView } from '../../components/ui';
import { colors } from '../../theme/colors';
import { useI18n } from '../../i18n';
import { api } from '../../api/client';
import { categoryIcon, GRADIENT_ICON_COLOR } from '../../utils/contentVisual';

const TYPES = ['article', 'audio', 'exercise'];
const CATEGORIES = ['anxiety', 'sleep', 'growth', 'exercises'];

const emptyForm = {
  type: 'article', category: 'anxiety', minutes: '5',
  titleAr: '', titleFr: '', summaryAr: '', summaryFr: '', bodyAr: '', bodyFr: '',
};

// Simple CMS over the content library (create / edit / delete).
export default function AdminContentScreen() {
  const { t, L } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null | { id? , form }
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['content'],
    queryFn: () => api('/content'),
  });

  const save = useMutation({
    mutationFn: ({ id, body }) =>
      id ? api(`/content/${id}`, { method: 'PUT', body }) : api('/content', { method: 'POST', body }),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['content'] });
    },
    onError: () => Alert.alert(t('common.errorTitle')),
  });

  const remove = useMutation({
    mutationFn: (id) => api(`/content/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
  });

  // External source: pull curated Wikipedia articles (ar+fr). New items land
  // unpublished at the top of this list for review via the eye toggle.
  const importWiki = useMutation({
    mutationFn: () => api('/content/import', { method: 'POST' }),
    onSuccess: ({ imported }) => {
      queryClient.invalidateQueries({ queryKey: ['content'] });
      Alert.alert(
        t('admin.importWiki'),
        imported.length
          ? t('admin.importDone', { n: imported.length })
          : t('admin.importNone')
      );
    },
    onError: () => Alert.alert(t('common.errorTitle'), t('common.networkError')),
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView onRetry={refetch} />;

  const openCreate = () => {
    setForm(emptyForm);
    setEditing({ id: null });
  };

  const openEdit = (item) => {
    const firstParagraph = (item.body || []).find((b) => b.type === 'p');
    setForm({
      type: item.type, category: item.category, minutes: String(item.minutes),
      titleAr: item.title.ar, titleFr: item.title.fr,
      summaryAr: item.summary.ar, summaryFr: item.summary.fr,
      bodyAr: firstParagraph?.text?.ar || '', bodyFr: firstParagraph?.text?.fr || '',
    });
    setEditing({ id: item.id, item });
  };

  const submit = () => {
    const body = {
      type: form.type,
      category: form.category,
      minutes: parseInt(form.minutes, 10) || 5,
      title: { ar: form.titleAr, fr: form.titleFr },
      summary: { ar: form.summaryAr, fr: form.summaryFr },
    };
    const paragraph = form.bodyAr || form.bodyFr
      ? [{ type: 'p', text: { ar: form.bodyAr, fr: form.bodyFr } }]
      : [];
    if (editing.id) {
      // Keep existing body blocks unless the admin edited the first paragraph.
      const existing = editing.item.body || [];
      body.body = paragraph.length
        ? [paragraph[0], ...existing.filter((b) => b !== existing.find((x) => x.type === 'p'))]
        : existing;
    } else {
      body.body = paragraph;
    }
    save.mutate({ id: editing.id, body });
  };

  const confirmDelete = (item) => {
    Alert.alert(t('admin.deleteContentConfirm'), L(item.title), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(item.id) },
    ]);
  };

  const valid = form.titleAr && form.titleFr && form.summaryAr && form.summaryFr;

  return (
    <Screen>
      <View style={{ padding: 22, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T w="700" size={22}>{t('admin.contentTitle')}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => importWiki.mutate()}
            disabled={importWiki.isPending}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card,
              borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
              paddingHorizontal: 12, paddingVertical: 9, opacity: importWiki.isPending ? 0.5 : 1,
            }}
          >
            <Ionicons
              name={importWiki.isPending ? 'hourglass-outline' : 'cloud-download-outline'}
              size={16} color={colors.primary}
            />
            <T w="600" size={13} color={colors.primary}>{t('admin.importWiki')}</T>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openCreate}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary,
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9,
            }}
          >
            <Ionicons name="add" size={17} color="#fff" />
            <T w="600" size={13} color="#fff">{t('admin.addContent')}</T>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 22, gap: 10 }}>
        {(data.items || []).map((item) => (
          <Card key={item.id} style={{ padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <LinearGradient
              colors={item.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={`${categoryIcon(item.category)}-outline`} size={20} color={GRADIENT_ICON_COLOR} />
            </LinearGradient>
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <T w="600" size={14} numberOfLines={1}>{L(item.title)}</T>
              <T size={11.5} color={colors.muted}>
                {t(`library.types.${item.type}`)} · {t(`library.categories.${item.category}`)}
                {!item.published && <T size={11.5} w="600" color={colors.warn}> · {t('admin.unpublishedBadge')}</T>}
              </T>
            </View>
            {/* Publish / unpublish (imported articles arrive unpublished for review) */}
            <TouchableOpacity
              onPress={() => save.mutate({ id: item.id, body: { published: !item.published } })}
              style={{ padding: 8 }}
            >
              <Ionicons
                name={item.published ? 'eye-outline' : 'eye-off-outline'} size={20}
                color={item.published ? colors.success : colors.warn}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openEdit(item)} style={{ padding: 8 }}>
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(item)} style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={20} color={colors.dangerDark} />
            </TouchableOpacity>
          </Card>
        ))}
      </ScrollView>

      {/* Create / edit form */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <Screen edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T w="700" size={20}>{editing?.id ? t('admin.editContent') : t('admin.addContent')}</T>
              <TouchableOpacity onPress={() => setEditing(null)}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <T w="600" size={14}>{t('admin.fieldType')}</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {TYPES.map((type) => (
                <Chip key={type} label={t(`library.types.${type}`)} active={form.type === type} onPress={() => setForm({ ...form, type })} />
              ))}
            </View>
            <T w="600" size={14}>{t('admin.fieldCategory')}</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {CATEGORIES.map((category) => (
                <Chip key={category} label={t(`library.categories.${category}`)} active={form.category === category} onPress={() => setForm({ ...form, category })} />
              ))}
            </View>

            <Input label={t('admin.fieldMinutes')} value={form.minutes} onChangeText={(v) => setForm({ ...form, minutes: v })} keyboardType="number-pad" ltr />
            <Input label={t('admin.fieldTitleAr')} value={form.titleAr} onChangeText={(v) => setForm({ ...form, titleAr: v })} />
            <Input label={t('admin.fieldTitleFr')} value={form.titleFr} onChangeText={(v) => setForm({ ...form, titleFr: v })} ltr />
            <Input label={t('admin.fieldSummaryAr')} value={form.summaryAr} onChangeText={(v) => setForm({ ...form, summaryAr: v })} />
            <Input label={t('admin.fieldSummaryFr')} value={form.summaryFr} onChangeText={(v) => setForm({ ...form, summaryFr: v })} ltr />
            <Input
              label={t('admin.fieldBodyAr')} value={form.bodyAr} onChangeText={(v) => setForm({ ...form, bodyAr: v })}
              multiline style={{ height: 120, textAlignVertical: 'top', paddingTop: 14 }}
            />
            <Input
              label={t('admin.fieldBodyFr')} value={form.bodyFr} onChangeText={(v) => setForm({ ...form, bodyFr: v })}
              multiline ltr style={{ height: 120, textAlignVertical: 'top', paddingTop: 14 }}
            />

            <Button title={t('common.save')} onPress={submit} loading={save.isPending} disabled={!valid} />
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}
