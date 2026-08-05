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
//
// Served to the app by GET /api/journal/scan-patterns (Phase 2.5): once the
// journal is encrypted, layer 1 has to run on the device, and a second copy
// of this list living in the client bundle is a list that drifts. Bump
// PATTERNS_VERSION whenever RISK_PATTERNS changes — an entry's scan
// attestation records the version that judged it.
const PATTERNS_VERSION = 1;

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

// Much broader death/self-harm-ADJACENT vocabulary (single stems across MSA,
// Darija, Arabizi and French). Deliberately over-broad, and used ONLY to
// decide the fail-closed direction when the LLM classifier returns something
// unparseable (riskService): on adjacent vocabulary an unreadable verdict is
// treated as "high". It must never gate alerts or holds on its own.
const RISK_ADJACENT_PATTERNS = [
  // Arabic stems
  'موت', 'اموت', 'نموت', 'الموت', 'انتحار', 'انتحر', 'اذي', 'ايذاء', 'اذية',
  'وداع', 'سامحوني', 'ارتاح', 'نرتاح', 'اختفي', 'نهاية', 'اعيش', 'نعيش', 'خلاص',
  // Arabizi / Darija latin
  'mout', 'nmout', 'mot ', 'n3ich', '3ich', 'nrtah', 'nertah', 'rou7i', 'rasi',
  'khlas', 'nkhlas', 'nemchi men had denya', 'wada3',
  // French
  'mort', 'mour', 'tuer', 'suicid', 'vivre', 'finir', 'disparai', 'adieu',
  // English (mixed-language messages)
  'die', 'death', 'kill', 'suicide', 'end it', 'goodbye',
];
const NORMALIZED_ADJACENT = RISK_ADJACENT_PATTERNS.map(normalize);

const scanForRiskAdjacent = (text) => {
  const value = normalize(text || '');
  return NORMALIZED_ADJACENT.some((p) => value.includes(p));
};

module.exports = {
  CRISIS_RESOURCES, scanForRisk, scanForRiskAdjacent,
  RISK_PATTERNS, PATTERNS_VERSION,
};
