// Validated intake instruments: GAD-7 (anxiety) and PHQ-9 (depression).
// Both are free to use, clinically recognized, and have published Arabic and
// French translations. Scoring bands follow the original publications
// (Spitzer et al. 2006 for GAD-7, Kroenke et al. 2001 for PHQ-9).

const FREQUENCY_OPTIONS = [
  { value: 0, label: { ar: 'أبداً', fr: 'Jamais' } },
  { value: 1, label: { ar: 'عدة أيام', fr: 'Plusieurs jours' } },
  { value: 2, label: { ar: 'أكثر من نصف الأيام', fr: 'Plus de la moitié des jours' } },
  { value: 3, label: { ar: 'كل يوم تقريباً', fr: 'Presque tous les jours' } },
];

const QUESTIONNAIRES = [
  {
    id: 'gad7',
    code: 'GAD-7',
    title: { ar: 'مقياس القلق العام', fr: "Échelle d'anxiété généralisée" },
    intro: {
      ar: 'خلال الأسبوعين الماضيين، كم مرة أزعجتك المشكلات التالية؟',
      fr: 'Au cours des deux dernières semaines, à quelle fréquence avez-vous été gêné(e) par les problèmes suivants ?',
    },
    dimension: { ar: 'القلق', fr: 'Anxiété' },
    options: FREQUENCY_OPTIONS,
    maxScore: 21,
    crisisItemIndex: null,
    items: [
      { id: 'g1', text: { ar: 'الشعور بالعصبية أو القلق أو التوتر الشديد', fr: 'Sentiment de nervosité, d’anxiété ou de tension' } },
      { id: 'g2', text: { ar: 'عدم القدرة على إيقاف القلق أو التحكم فيه', fr: 'Incapacité d’arrêter de vous inquiéter ou de contrôler vos inquiétudes' } },
      { id: 'g3', text: { ar: 'القلق المفرط بشأن أمور مختلفة', fr: 'Inquiétudes excessives à propos de choses diverses' } },
      { id: 'g4', text: { ar: 'صعوبة في الاسترخاء', fr: 'Difficulté à vous détendre' } },
      { id: 'g5', text: { ar: 'التململ الشديد بحيث يصعب عليك الجلوس بهدوء', fr: 'Agitation telle qu’il est difficile de rester assis(e)' } },
      { id: 'g6', text: { ar: 'الانزعاج أو الغضب بسهولة', fr: 'Tendance à être facilement contrarié(e) ou irritable' } },
      { id: 'g7', text: { ar: 'الشعور بالخوف كأن شيئاً سيئاً قد يحدث', fr: 'Sentiment de peur comme si quelque chose de terrible allait arriver' } },
    ],
    bands: [
      { max: 4, level: 'minimal', label: { ar: 'قلق ضئيل', fr: 'Anxiété minimale' } },
      { max: 9, level: 'mild', label: { ar: 'قلق خفيف', fr: 'Anxiété légère' } },
      { max: 14, level: 'moderate', label: { ar: 'قلق متوسط', fr: 'Anxiété modérée' } },
      { max: 21, level: 'severe', label: { ar: 'قلق شديد', fr: 'Anxiété sévère' } },
    ],
  },
  {
    id: 'phq9',
    code: 'PHQ-9',
    title: { ar: 'مقياس الصحة النفسية للاكتئاب', fr: 'Questionnaire de santé du patient (dépression)' },
    intro: {
      ar: 'خلال الأسبوعين الماضيين، كم مرة أزعجتك المشكلات التالية؟',
      fr: 'Au cours des deux dernières semaines, à quelle fréquence avez-vous été gêné(e) par les problèmes suivants ?',
    },
    dimension: { ar: 'المزاج', fr: 'Humeur' },
    options: FREQUENCY_OPTIONS,
    maxScore: 27,
    // Item 9 asks about self-harm ideation. Any answer above 0 triggers the
    // safety protocol regardless of the total score.
    crisisItemIndex: 8,
    items: [
      { id: 'p1', text: { ar: 'قلة الاهتمام أو المتعة في القيام بالأشياء', fr: 'Peu d’intérêt ou de plaisir à faire les choses' } },
      { id: 'p2', text: { ar: 'الشعور بالإحباط أو الاكتئاب أو اليأس', fr: 'Sentiment de tristesse, de déprime ou de désespoir' } },
      { id: 'p3', text: { ar: 'صعوبة في النوم أو الاستمرار فيه، أو النوم أكثر من اللازم', fr: 'Difficulté à s’endormir, à rester endormi(e), ou sommeil excessif' } },
      { id: 'p4', text: { ar: 'الشعور بالتعب أو قلة الطاقة', fr: 'Sentiment de fatigue ou manque d’énergie' } },
      { id: 'p5', text: { ar: 'ضعف الشهية أو الإفراط في الأكل', fr: 'Manque d’appétit ou excès alimentaires' } },
      { id: 'p6', text: { ar: 'الشعور بالسوء تجاه نفسك، أو أنك فاشل أو خذلت نفسك أو عائلتك', fr: 'Mauvaise perception de vous-même, sentiment d’être un(e) raté(e) ou d’avoir déçu votre famille' } },
      { id: 'p7', text: { ar: 'صعوبة في التركيز على الأشياء مثل القراءة أو مشاهدة التلفاز', fr: 'Difficulté à vous concentrer, par exemple pour lire ou regarder la télévision' } },
      { id: 'p8', text: { ar: 'التحرك أو التحدث ببطء ملحوظ، أو على العكس، التململ والحركة أكثر من المعتاد', fr: 'Lenteur inhabituelle à bouger ou parler, ou au contraire agitation inhabituelle' } },
      { id: 'p9', text: { ar: 'أفكار بأنك أفضل حالاً لو لم تكن موجوداً، أو أفكار بإيذاء نفسك', fr: 'Pensées que vous seriez mieux mort(e) ou envie de vous faire du mal' } },
    ],
    bands: [
      { max: 4, level: 'minimal', label: { ar: 'أعراض ضئيلة', fr: 'Symptômes minimaux' } },
      { max: 9, level: 'mild', label: { ar: 'أعراض خفيفة', fr: 'Symptômes légers' } },
      { max: 14, level: 'moderate', label: { ar: 'أعراض متوسطة', fr: 'Symptômes modérés' } },
      { max: 19, level: 'moderately_severe', label: { ar: 'أعراض متوسطة إلى شديدة', fr: 'Symptômes modérément sévères' } },
      { max: 27, level: 'severe', label: { ar: 'أعراض شديدة', fr: 'Symptômes sévères' } },
    ],
  },
];

const getQuestionnaire = (id) => QUESTIONNAIRES.find((q) => q.id === id) || null;

/**
 * answers: array of integers (0-3), one per item, in item order.
 * Returns { score, level, label, crisisFlag } or null when answers are invalid.
 */
function scoreQuestionnaire(questionnaire, answers) {
  if (!Array.isArray(answers) || answers.length !== questionnaire.items.length) return null;
  if (!answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3)) return null;

  const score = answers.reduce((sum, a) => sum + a, 0);
  const band = questionnaire.bands.find((b) => score <= b.max);
  const crisisFlag =
    questionnaire.crisisItemIndex !== null && answers[questionnaire.crisisItemIndex] > 0;

  return { score, level: band.level, label: band.label, crisisFlag };
}

module.exports = { QUESTIONNAIRES, getQuestionnaire, scoreQuestionnaire };
