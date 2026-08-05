import { createContext, useContext, useEffect, useState } from 'react';

// Compact bilingual dictionary for the console. Arabic-first with RTL, same
// as the app; specialists switch to French from the header.
const DICT = {
  ar: {
    appName: 'كلّمني — لوحة المختص',
    login: 'تسجيل الدخول', email: 'البريد الإلكتروني', password: 'كلمة المرور',
    loginError: 'بيانات الدخول غير صحيحة', loginRoleError: 'هذه اللوحة للمختصين والمشرفين فقط',
    logout: 'خروج', loading: 'جارٍ التحميل...', retry: 'إعادة المحاولة', none: 'لا يوجد',
    patients: 'المرضى', alerts: 'تنبيهات الأمان', rota: 'المناوبة',
    search: 'بحث بالاسم...', openAlerts: 'تنبيهات مفتوحة', lastMessage: 'آخر رسالة',
    newCase: 'حالة جديدة', unread: 'غير مقروءة',
    patientFile: 'ملف المريض', back: 'رجوع', intake: 'نتائج التقييم', score: 'النتيجة',
    checkins: 'التسجيلات اليومية', mood: 'المزاج', stress: 'التوتر', energy: 'الطاقة', sleep: 'النوم',
    note: 'ملاحظة',
    mbcTitle: 'تتبّع النتائج السريرية', clinicianOnly: 'للمختص فقط',
    selfHarmItem: 'البند 9 — أفكار إيذاء النفس', selfHarmRose: 'ارتفع من {from} إلى {to}',
    baseline: 'البداية', sinceLast: 'منذ التقييم السابق', sinceBaseline: 'منذ البداية',
    pointsDown: '{n} نقاط انخفاضاً', pointsUp: '{n} نقاط ارتفاعاً', withinNoise: 'ضمن هامش الخطأ',
    recovered: 'تحسّن موثوق وتحت العتبة السريرية',
    nonResponse: 'أقل من 50% تحسّن بعد {weeks} أسبوعاً — يستحسن مراجعة خطة العلاج.',
    rciFootnote: 'الفرق الموثوق: {n} نقاط أو أكثر.', administrations: '{n} تقييمات',
    alertsOpen: 'التنبيهات المفتوحة', alertsNone: 'لا توجد تنبيهات مفتوحة.',
    critical: 'حرج — دون متابعة منذ أكثر من ساعة',
    ack: 'توثيق وإغلاق', ackTitle: 'توثيق الإجراء المتخذ',
    ackHint: 'دوّن ما قمت به فعلاً: اتصال بالمريض، تقييم الخطورة، توجيه للطوارئ...',
    ackPlaceholder: 'مثال: اتصلت بالمريض، قيّمت الحالة، جلسة غداً صباحاً.',
    ackTooShort: 'يرجى وصف الإجراء المتخذ.', cancel: 'إلغاء',
    source: 'المصدر', opened: 'فُتح', patient: 'المريض', trigger: 'المحتوى',
    escalationTrail: 'سجلّ التنبيهات', paged: 'أُبلغ', tier: 'المستوى',
    rotaTitle: 'مناوبة الحالات غير المسندة',
    rotaHint: 'من يُبلَّغ عند وجود خطر لدى مريض بلا مختص. المستوى 1 أولاً، والمستوى 2 بعد 15 دقيقة دون استجابة.',
    rotaEmpty: 'لا توجد مناوبة — سيتم إبلاغ جميع المشرفين.',
    rotaAdd: 'إضافة مناوبة', specialist: 'المختص', from: 'من', to: 'إلى', remove: 'حذف',
    sourceChat: 'محادثة', sourceAiChat: 'الرفيق الآلي', sourceQuestionnaire: 'تقييم', sourceJournal: 'مذكرات',
    briefsTitle: 'ملاحظات قبل الجلسة', patientAuthored: 'من المريض',
    briefsHint: 'ما اختار المريض إرساله قبل جلساتكم. ما لم يختره لم يُحفظ.',
    briefSharedItems: '{n} عناصر', alwaysShared: 'يُرسل دائماً', theirWords: 'بكلماته',
    takeaway: 'ما خرج به من الجلسة',
    noteLocked: 'ملاحظة مقفلة — لم يشاركها المريض',
    noteSharedOpenInApp: 'شاركها المريض — افتحها من التطبيق',
  },
  fr: {
    appName: 'Kalimni — Console spécialiste',
    login: 'Connexion', email: 'E-mail', password: 'Mot de passe',
    loginError: 'Identifiants invalides', loginRoleError: 'Console réservée aux spécialistes et administrateurs',
    logout: 'Déconnexion', loading: 'Chargement...', retry: 'Réessayer', none: 'Aucun',
    patients: 'Patients', alerts: 'Alertes', rota: 'Astreinte',
    search: 'Rechercher un nom...', openAlerts: 'Alertes ouvertes', lastMessage: 'Dernier message',
    newCase: 'Nouveau cas', unread: 'non lus',
    patientFile: 'Dossier patient', back: 'Retour', intake: 'Résultats des questionnaires', score: 'Score',
    checkins: 'Points quotidiens', mood: 'Humeur', stress: 'Stress', energy: 'Énergie', sleep: 'Sommeil',
    note: 'Note',
    mbcTitle: 'Suivi clinique par la mesure', clinicianOnly: 'Réservé au spécialiste',
    selfHarmItem: 'Item 9 — pensées d’automutilation', selfHarmRose: 'En hausse : {from} → {to}',
    baseline: 'Départ', sinceLast: 'Depuis la précédente', sinceBaseline: 'Depuis le départ',
    pointsDown: '{n} points de moins', pointsUp: '{n} points de plus', withinNoise: 'Dans la marge d’erreur',
    recovered: 'Amélioration fiable et sous le seuil clinique',
    nonResponse: 'Moins de 50 % de réduction après {weeks} semaines — revoir le plan.',
    rciFootnote: 'Changement fiable : {n} points ou plus.', administrations: '{n} passations',
    alertsOpen: 'Alertes ouvertes', alertsNone: 'Aucune alerte ouverte.',
    critical: 'Critique — sans prise en charge depuis plus d’une heure',
    ack: 'Consigner et fermer', ackTitle: 'Consigner l’action menée',
    ackHint: 'Notez ce que vous avez réellement fait : appel, évaluation du risque, orientation...',
    ackPlaceholder: 'Ex. : appel au patient, situation évaluée, séance demain matin.',
    ackTooShort: 'Décrivez l’action menée.', cancel: 'Annuler',
    source: 'Source', opened: 'Ouverte', patient: 'Patient', trigger: 'Contenu',
    escalationTrail: 'Historique des relances', paged: 'Prévenu', tier: 'Niveau',
    rotaTitle: 'Astreinte pour les patients non assignés',
    rotaHint: 'Qui est prévenu quand un patient sans spécialiste est en danger. Niveau 1 d’abord, niveau 2 après 15 minutes sans réponse.',
    rotaEmpty: 'Aucune astreinte — tous les administrateurs seront prévenus.',
    rotaAdd: 'Ajouter', specialist: 'Spécialiste', from: 'Du', to: 'Au', remove: 'Retirer',
    sourceChat: 'Messagerie', sourceAiChat: 'Compagnon IA', sourceQuestionnaire: 'Questionnaire', sourceJournal: 'Journal',
    briefsTitle: 'Notes avant séance', patientAuthored: 'Écrit par le patient',
    briefsHint: 'Ce que le patient a choisi d’envoyer avant vos séances. Ce qu’il n’a pas choisi n’a pas été conservé.',
    briefSharedItems: '{n} élément(s)', alwaysShared: 'Toujours envoyé', theirWords: 'Ses mots',
    takeaway: 'Ce qu’il a retenu de la séance',
    noteLocked: 'Note verrouillée — non partagée',
    noteSharedOpenInApp: 'Partagée — à ouvrir dans l’application',
  },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('kalimni.console.lang') || 'ar');

  useEffect(() => {
    localStorage.setItem('kalimni.console.lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const t = (key, params) => {
    let value = DICT[lang][key] ?? DICT.ar[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) value = value.replaceAll(`{${k}}`, String(v));
    }
    return value;
  };
  // Content records from the API carry both languages.
  const L = (obj) => (obj ? obj[lang] ?? obj.ar ?? '' : '');

  return <I18nContext.Provider value={{ lang, setLang, t, L }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

export const formatDateTime = (iso, lang) =>
  new Date(iso).toLocaleString(lang === 'fr' ? 'fr-DZ' : 'ar-DZ', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export const formatDate = (iso, lang) =>
  new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-DZ' : 'ar-DZ', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
