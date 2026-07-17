import { I18nManager } from 'react-native';
import ar from './ar';
import fr from './fr';
import { useSettings } from '../store/settings';

const dictionaries = { ar, fr };

const resolve = (dict, key) =>
  key.split('.').reduce((node, part) => (node ? node[part] : undefined), dict);

export function translate(lang, key, params) {
  let value = resolve(dictionaries[lang], key) ?? resolve(dictionaries.ar, key) ?? key;
  if (typeof value === 'string' && params) {
    Object.entries(params).forEach(([k, v]) => {
      value = value.replaceAll(`{${k}}`, String(v));
    });
  }
  return value;
}

// Content records from the API carry both languages: { ar: '...', fr: '...' }.
export const pickLang = (obj, lang) => (obj ? obj[lang] ?? obj.ar ?? '' : '');

export function useI18n() {
  const lang = useSettings((s) => s.language);
  return {
    lang,
    isRTL: I18nManager.isRTL,
    t: (key, params) => translate(lang, key, params),
    L: (obj) => pickLang(obj, lang),
  };
}
