const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export const localizeDigits = (value, lang) => {
  const str = String(value);
  if (lang !== 'ar') return str;
  return str.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
};

export const formatTime = (iso, lang) => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return localizeDigits(`${hh}:${mm}`, lang);
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "10:26" today, "أمس"/"Hier" yesterday, otherwise a short date.
export const formatWhen = (iso, lang, t) => {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return formatTime(iso, lang);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return t('common.yesterday');
  return localizeDigits(
    d.toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-FR', { day: 'numeric', month: 'short' }),
    lang
  );
};

export const formatDate = (iso, lang) => {
  const d = new Date(iso);
  return localizeDigits(
    d.toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    lang
  );
};

// "الخميس ١٦ يوليو · ٤:٠٠ م" / "jeudi 16 juil. · 16:00" — for session cards.
export const formatDateTime = (iso, lang) => {
  const d = new Date(iso);
  const locale = lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  const date = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return localizeDigits(`${date} · ${formatTime(iso, lang)}`, lang);
};

// Short day label for the slot picker chips: "الخميس ١٦/٧" / "jeu. 16/7".
export const formatDayShort = (date, lang) => {
  const locale = lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  const weekday = date.toLocaleDateString(locale, { weekday: 'short' });
  return localizeDigits(`${weekday} ${date.getDate()}/${date.getMonth() + 1}`, lang);
};

export const initialsOf = (name = '؟') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
