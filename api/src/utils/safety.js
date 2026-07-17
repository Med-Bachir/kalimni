// Safety layer: crisis resources shown in the app, plus a lightweight keyword
// scan over patient messages. A keyword hit never blocks the message; it flags
// it for the assigned specialist and shows crisis resources to the patient.
// This is a support net, not a diagnostic tool.

// IMPORTANT: verify every phone number with the operating authority before any
// public release. Numbers below are national emergency services in Algeria.
const CRISIS_RESOURCES = {
  disclaimer: {
    ar: 'تطبيق كلّمني ليس بديلاً عن الرعاية الطارئة. إذا كنت في خطر مباشر أو تراودك أفكار لإيذاء نفسك، اتصل فوراً بأحد الأرقام التالية أو توجّه إلى أقرب مستشفى.',
    fr: "Kalimni ne remplace pas les soins d'urgence. Si vous êtes en danger immédiat ou avez des pensées d'automutilation, appelez immédiatement l'un des numéros suivants ou rendez-vous à l'hôpital le plus proche.",
  },
  resources: [
    {
      id: 'civil-protection',
      name: { ar: 'الحماية المدنية (إسعاف)', fr: 'Protection civile (ambulance)' },
      phone: '14',
      available: { ar: 'متاح 24/7', fr: 'Disponible 24h/24' },
    },
    {
      id: 'police',
      name: { ar: 'الشرطة', fr: 'Police' },
      phone: '17',
      available: { ar: 'متاح 24/7', fr: 'Disponible 24h/24' },
    },
    {
      id: 'samu',
      name: { ar: 'الاستعجالات الطبية SAMU', fr: 'Urgences médicales SAMU' },
      phone: '115',
      available: { ar: 'متاح 24/7', fr: 'Disponible 24h/24' },
    },
  ],
};

// Conservative keyword lists (Arabic incl. common Algerian phrasing + French).
const RISK_PATTERNS = [
  // Arabic
  'انتحار', 'أنتحر', 'الانتحار', 'اؤذي نفسي', 'أؤذي نفسي', 'إيذاء نفسي',
  'أذية نفسي', 'انهي حياتي', 'أنهي حياتي', 'اقتل نفسي', 'أقتل نفسي',
  'لا أريد العيش', 'ما عاد نقدر نعيش', 'نموت خير', 'أتمنى الموت', 'اتمنى الموت',
  // French
  'suicide', 'me suicider', 'me faire du mal', 'me tuer', 'mourir',
  "plus envie de vivre", "veux en finir",
];

const normalize = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // strip Arabic diacritics
    .replace(/[أإآ]/g, 'ا');

const NORMALIZED_PATTERNS = RISK_PATTERNS.map(normalize);

const scanForRisk = (text) => {
  const value = normalize(text || '');
  return NORMALIZED_PATTERNS.some((p) => value.includes(p));
};

module.exports = { CRISIS_RESOURCES, scanForRisk };
