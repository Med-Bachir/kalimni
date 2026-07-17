// Curated launch content (articles, guided exercises, audio placeholders).
// Managed by admins through /api/content. Body is a list of blocks so the
// mobile reader can render headings, paragraphs and embedded exercise CTAs.
// gradient: [start, end] colors used for the card/hero art in the app.

const CONTENT_SEED = [
  {
    key: 'panic-guide',
    type: 'article',
    category: 'anxiety',
    featured: true,
    minutes: 8,
    gradient: ['#BFDCE5', '#8FBCCB'],
    author: { ar: 'د. نادية شريف', fr: 'Dr Nadia Cherif' },
    title: { ar: 'دليلك للتعامل مع نوبات القلق', fr: "Votre guide pour gérer les crises d'angoisse" },
    summary: {
      ar: 'خطوات عملية تساعدك على استعادة الهدوء أثناء نوبة القلق.',
      fr: "Des étapes concrètes pour retrouver votre calme pendant une crise d'angoisse.",
    },
    body: [
      { type: 'p', text: {
        ar: 'نوبة القلق تجربة مزعجة لكنها ليست خطيرة. أول خطوة للتعامل معها هي فهم ما يحدث في جسدك: تسارع في ضربات القلب، وضيق في التنفس، وشعور بفقدان السيطرة.',
        fr: "Une crise d'angoisse est une expérience pénible mais sans danger. La première étape est de comprendre ce qui se passe dans votre corps : accélération du rythme cardiaque, souffle court et sentiment de perte de contrôle." } },
      { type: 'h', text: { ar: '١. ركّز على تنفسك', fr: '1. Concentrez-vous sur votre respiration' } },
      { type: 'p', text: {
        ar: 'خذ شهيقاً بطيئاً من الأنف لأربع ثوانٍ، ثم احبس النفس سبع ثوانٍ، وأخرجه ببطء من الفم لثماني ثوانٍ. كرّر ذلك أربع مرات.',
        fr: "Inspirez lentement par le nez pendant quatre secondes, retenez votre souffle sept secondes, puis expirez lentement par la bouche pendant huit secondes. Répétez quatre fois." } },
      { type: 'exercise', exerciseKey: 'breathing478', text: {
        ar: 'جرّب تمرين التنفس الآن', fr: "Essayez l'exercice de respiration maintenant" } },
      { type: 'h', text: { ar: '٢. أعد الاتصال بمحيطك', fr: '2. Reconnectez-vous à votre environnement' } },
      { type: 'p', text: {
        ar: 'استخدم قاعدة ٥-٤-٣-٢-١: سمِّ خمسة أشياء تراها، وأربعة تلمسها، وثلاثة تسمعها، واثنين تشمّهما، وشيئاً واحداً تتذوقه. هذا يعيد عقلك إلى اللحظة الحالية.',
        fr: 'Utilisez la règle 5-4-3-2-1 : nommez cinq choses que vous voyez, quatre que vous touchez, trois que vous entendez, deux que vous sentez et une que vous goûtez. Cela ramène votre esprit au moment présent.' } },
      { type: 'h', text: { ar: '٣. ذكّر نفسك أنها ستمر', fr: '3. Rappelez-vous que cela va passer' } },
      { type: 'p', text: {
        ar: 'تصل النوبة إلى ذروتها خلال دقائق ثم تنحسر. قل لنفسك: "هذا شعور مؤقت، جسدي يحاول حمايتي، وسيهدأ قريباً". وإذا تكررت النوبات، تحدّث مع مختصك حول خطة علاجية مناسبة.',
        fr: "La crise atteint son pic en quelques minutes puis reflue. Dites-vous : « c'est temporaire, mon corps essaie de me protéger, il va bientôt se calmer ». Si les crises se répètent, parlez-en à votre spécialiste." } },
    ],
  },
  {
    key: 'daily-anxiety',
    type: 'article',
    category: 'anxiety',
    minutes: 4,
    gradient: ['#BFDCE5', '#8FBCCB'],
    author: { ar: 'د. سمير بن علي', fr: 'Dr Samir Benali' },
    title: { ar: 'كيف تتعامل مع القلق اليومي؟', fr: 'Comment gérer l’anxiété au quotidien ?' },
    summary: {
      ar: 'عادات صغيرة تخفف التوتر المتراكم خلال اليوم.',
      fr: 'De petites habitudes qui allègent la tension accumulée pendant la journée.',
    },
    body: [
      { type: 'p', text: {
        ar: 'القلق اليومي لا يحتاج دائماً إلى حلول كبيرة، بل إلى عادات صغيرة ومنتظمة. ابدأ بتحديد أوقات "القلق المسموح": عشر دقائق يومياً تكتب فيها كل ما يقلقك، ثم تعود لحياتك.',
        fr: "L'anxiété quotidienne ne demande pas toujours de grandes solutions, mais de petites habitudes régulières. Réservez dix minutes par jour pour noter tout ce qui vous inquiète, puis reprenez votre journée." } },
      { type: 'p', text: {
        ar: 'قلّل المنبهات في النصف الثاني من اليوم، وتحرّك ولو عشر دقائق مشياً؛ الحركة تصرف هرمونات التوتر. ولا تقارن يومك بأيام الآخرين على وسائل التواصل.',
        fr: 'Réduisez les excitants en fin de journée et bougez, ne serait-ce que dix minutes de marche ; le mouvement évacue les hormones du stress. Et ne comparez pas votre journée à celles des autres sur les réseaux.' } },
      { type: 'p', text: {
        ar: 'أخيراً، تذكّر أن طلب المساعدة ليس ضعفاً. مشاركة ما تشعر به مع مختص خطوة شجاعة نحو التوازن.',
        fr: "Enfin, demander de l'aide n'est pas une faiblesse. Partager ce que vous ressentez avec un spécialiste est un pas courageux vers l'équilibre." } },
    ],
  },
  {
    key: 'better-sleep',
    type: 'article',
    category: 'sleep',
    minutes: 6,
    gradient: ['#D8E8DC', '#A5C8AF'],
    author: { ar: 'د. نادية شريف', fr: 'Dr Nadia Cherif' },
    title: { ar: 'عادات بسيطة لنوم أفضل', fr: 'Des habitudes simples pour mieux dormir' },
    summary: {
      ar: 'روتين مسائي يساعد جسمك على الاستعداد للنوم العميق.',
      fr: 'Une routine du soir qui prépare votre corps à un sommeil profond.',
    },
    body: [
      { type: 'p', text: {
        ar: 'النوم الجيد يبدأ قبل ساعات من موعده. ثبّت وقت استيقاظك حتى في العطل، فالساعة البيولوجية تحب الانتظام أكثر من التعويض.',
        fr: "Un bon sommeil se prépare des heures à l'avance. Fixez votre heure de réveil, même le week-end : l'horloge biologique préfère la régularité à la récupération." } },
      { type: 'h', text: { ar: 'قبل النوم بساعة', fr: 'Une heure avant de dormir' } },
      { type: 'p', text: {
        ar: 'أطفئ الشاشات أو فعّل الوضع الليلي، وخفّف الإضاءة. جرّب طقساً هادئاً: دش دافئ، قراءة خفيفة، أو تمرين تنفس قصير.',
        fr: 'Éteignez les écrans ou activez le mode nuit, baissez la lumière. Essayez un rituel calme : douche tiède, lecture légère ou un court exercice de respiration.' } },
      { type: 'exercise', exerciseKey: 'breathing478', text: {
        ar: 'تمرين تنفس قبل النوم', fr: 'Respiration avant de dormir' } },
      { type: 'p', text: {
        ar: 'إذا لم تنم خلال عشرين دقيقة، انهض واجلس في مكان هادئ بإضاءة خافتة حتى تشعر بالنعاس، ثم عد إلى السرير. السرير للنوم فقط.',
        fr: "Si vous ne dormez pas au bout de vingt minutes, levez-vous et installez-vous dans un endroit calme et tamisé jusqu'à ressentir le sommeil, puis retournez au lit. Le lit sert uniquement à dormir." } },
    ],
  },
  {
    key: 'self-confidence',
    type: 'article',
    category: 'growth',
    minutes: 5,
    gradient: ['#F3E5D8', '#DDBB94'],
    author: { ar: 'د. سمير بن علي', fr: 'Dr Samir Benali' },
    title: { ar: 'كيف تبني ثقتك بنفسك؟', fr: 'Comment construire la confiance en soi ?' },
    summary: {
      ar: 'الثقة مهارة تُبنى بالممارسة، لا صفة تولد معك.',
      fr: 'La confiance est une compétence qui se construit, pas un trait de naissance.',
    },
    body: [
      { type: 'p', text: {
        ar: 'الثقة بالنفس لا تعني غياب الخوف، بل التصرف رغم وجوده. ابدأ بأهداف صغيرة قابلة للتحقيق، واحتفل بإنجازها مهما بدت بسيطة.',
        fr: "La confiance en soi n'est pas l'absence de peur, mais l'action malgré elle. Commencez par de petits objectifs atteignables et célébrez-les, aussi simples soient-ils." } },
      { type: 'p', text: {
        ar: 'راقب حديثك الداخلي: هل تخاطب نفسك كما تخاطب صديقاً تحبه؟ استبدل "أنا فاشل" بـ"أنا أتعلم". اللغة تشكّل الشعور.',
        fr: "Observez votre discours intérieur : vous parlez-vous comme à un ami cher ? Remplacez « je suis nul » par « j'apprends ». Le langage façonne le ressenti." } },
      { type: 'p', text: {
        ar: 'ودوّن كل مساء ثلاثة أشياء قمت بها جيداً. بعد أسابيع ستملك دليلاً مكتوباً على كفاءتك يصعب على القلق إنكاره.',
        fr: 'Chaque soir, notez trois choses que vous avez bien faites. Après quelques semaines, vous aurez une preuve écrite de vos capacités, difficile à nier même pour votre anxiété.' } },
    ],
  },
  {
    key: 'breathing478',
    type: 'exercise',
    exerciseKey: 'breathing478',
    category: 'exercises',
    minutes: 5,
    gradient: ['#E3EFF4', '#BFDCE5'],
    author: { ar: 'فريق كلّمني', fr: 'Équipe Kalimni' },
    title: { ar: 'تمرين التنفس ٤-٧-٨', fr: 'Exercice de respiration 4-7-8' },
    summary: {
      ar: 'تقنية تنفس موجّهة تهدّئ الجهاز العصبي خلال دقائق.',
      fr: 'Une technique de respiration guidée qui apaise le système nerveux en quelques minutes.',
    },
    body: [
      { type: 'p', text: {
        ar: 'تمرين ٤-٧-٨ يبطئ إيقاع التنفس فيرسل لجسدك إشارة أمان. اجلس باسترخاء، ثم اتبع الإرشاد المرئي: شهيق ٤ ثوانٍ، حبس ٧ ثوانٍ، زفير ٨ ثوانٍ.',
        fr: "L'exercice 4-7-8 ralentit le rythme respiratoire et envoie un signal de sécurité à votre corps : inspiration 4 s, rétention 7 s, expiration 8 s." } },
      { type: 'exercise', exerciseKey: 'breathing478', text: {
        ar: 'ابدأ التمرين الموجّه', fr: "Commencer l'exercice guidé" } },
    ],
  },
  {
    key: 'muscle-relaxation',
    type: 'audio',
    category: 'exercises',
    minutes: 12,
    gradient: ['#EDEAF6', '#B9B1DC'],
    author: { ar: 'د. نادية شريف', fr: 'Dr Nadia Cherif' },
    title: { ar: 'تمرين الاسترخاء العضلي التدريجي', fr: 'Relaxation musculaire progressive' },
    summary: {
      ar: 'جلسة صوتية موجّهة لإرخاء الجسم عضلةً عضلة.',
      fr: 'Une séance audio guidée pour détendre le corps muscle par muscle.',
    },
    body: [
      { type: 'p', text: {
        ar: 'الاسترخاء العضلي التدريجي يعتمد على شدّ كل مجموعة عضلية خمس ثوانٍ ثم إرخائها ببطء، من القدمين حتى الوجه. (التسجيل الصوتي سيتوفر في نسخة قادمة — يمكنك اتباع الخطوات نصياً).',
        fr: 'La relaxation musculaire progressive consiste à contracter chaque groupe musculaire cinq secondes puis à le relâcher lentement, des pieds au visage. (L’audio arrivera dans une prochaine version — suivez les étapes ci-dessous.)' } },
      { type: 'p', text: {
        ar: 'ابدأ بأصابع قدميك: اضغطها بقوة… ثم أفلت. اصعد إلى الساقين، البطن، الكتفين، ثم قبضة اليدين، وأخيراً عضلات الوجه. لاحظ الفرق بين التوتر والارتخاء.',
        fr: 'Commencez par les orteils : serrez fort… puis relâchez. Remontez vers les jambes, le ventre, les épaules, les poings, et enfin les muscles du visage. Remarquez la différence entre tension et détente.' } },
    ],
  },
  {
    key: 'journaling',
    type: 'exercise',
    category: 'exercises',
    minutes: 10,
    gradient: ['#EDEAF6', '#B9B1DC'],
    author: { ar: 'فريق كلّمني', fr: 'Équipe Kalimni' },
    title: { ar: 'تدوين المشاعر', fr: 'Journal des émotions' },
    summary: {
      ar: 'تمرين كتابة قصير يزيد وعيك بمشاعرك ويخفف حدّتها.',
      fr: 'Un court exercice d’écriture pour mieux comprendre et apaiser vos émotions.',
    },
    body: [
      { type: 'p', text: {
        ar: 'أمسك ورقة أو افتح ملاحظات هاتفك، واكتب لمدة عشر دقائق دون توقف إجابةً عن ثلاثة أسئلة: ماذا أشعر الآن؟ ما الذي أثار هذا الشعور؟ ما الذي أحتاجه في هذه اللحظة؟',
        fr: "Prenez une feuille ou vos notes et écrivez dix minutes sans vous arrêter en répondant à trois questions : qu'est-ce que je ressens ? Qu'est-ce qui a déclenché cette émotion ? De quoi ai-je besoin maintenant ?" } },
      { type: 'p', text: {
        ar: 'لا تصحح ولا تجمّل الكلمات؛ الهدف هو إخراج المشاعر لا كتابة نص جميل. مع الوقت ستلاحظ أنماطاً تتكرر يمكن مناقشتها مع مختصك.',
        fr: "Ne corrigez pas, n'embellissez pas ; le but est d'extérioriser, pas d'écrire un beau texte. Avec le temps, des schémas récurrents apparaîtront, à discuter avec votre spécialiste." } },
    ],
  },
  {
    key: 'panic-understanding',
    type: 'article',
    category: 'anxiety',
    minutes: 7,
    gradient: ['#BFDCE5', '#8FBCCB'],
    author: { ar: 'د. سمير بن علي', fr: 'Dr Samir Benali' },
    title: { ar: 'فهم نوبات الهلع: لماذا تحدث؟', fr: 'Comprendre les attaques de panique' },
    summary: {
      ar: 'ما الذي يحدث في دماغك وجسدك أثناء نوبة الهلع؟',
      fr: 'Que se passe-t-il dans votre cerveau et votre corps pendant une attaque de panique ?',
    },
    body: [
      { type: 'p', text: {
        ar: 'نوبة الهلع هي إنذار خاطئ من جهاز البقاء لديك: الدماغ يظن أن هناك خطراً فيضخ الأدرينالين، فيتسارع القلب ويتصبب العرق وتشعر برغبة في الهروب.',
        fr: "Une attaque de panique est une fausse alerte de votre système de survie : le cerveau croit à un danger et libère de l'adrénaline — le cœur s'accélère, vous transpirez, vous voulez fuir." } },
      { type: 'p', text: {
        ar: 'المفارقة أن الخوف من النوبة نفسها هو ما يغذّيها. عندما تفهم أن هذه الأعراض غير خطيرة، تفقد النوبة جزءاً كبيراً من قوتها.',
        fr: "Paradoxalement, c'est la peur de la crise elle-même qui l'alimente. Comprendre que ces symptômes sont sans danger lui retire une grande partie de sa force." } },
      { type: 'p', text: {
        ar: 'العلاج المعرفي السلوكي أثبت فعالية عالية مع نوبات الهلع. تحدّث مع مختصك عن التعرّض التدريجي وإعادة تفسير الأعراس الجسدية.',
        fr: 'La thérapie cognitivo-comportementale est très efficace contre la panique. Parlez avec votre spécialiste de l’exposition progressive et de la réinterprétation des sensations corporelles.' } },
    ],
  },
  {
    key: 'evening-routine',
    type: 'article',
    category: 'sleep',
    minutes: 5,
    gradient: ['#D8E8DC', '#A5C8AF'],
    author: { ar: 'د. نادية شريف', fr: 'Dr Nadia Cherif' },
    title: { ar: 'روتين المساء الهادئ', fr: 'Une routine du soir apaisante' },
    summary: {
      ar: 'كيف تبني ساعة مسائية تفصل يومك عن نومك.',
      fr: 'Construire une heure du soir qui sépare votre journée de votre nuit.',
    },
    body: [
      { type: 'p', text: {
        ar: 'عقلك يحتاج إشارة واضحة أن اليوم انتهى. اختر ثلاث خطوات ثابتة تكررها كل مساء بنفس الترتيب: مثلاً كوب مشروب دافئ بلا كافيين، ثم تدوين سريع لمهام الغد، ثم قراءة عشر صفحات.',
        fr: "Votre cerveau a besoin d'un signal clair de fin de journée. Choisissez trois étapes fixes répétées chaque soir dans le même ordre : une boisson chaude sans caféine, la liste des tâches de demain, puis dix pages de lecture." } },
      { type: 'p', text: {
        ar: 'كتابة مهام الغد قبل النوم تفرغ ذهنك من "حلقة التذكر" التي توقظك ليلاً. جرّبها أسبوعاً ولاحظ الفرق.',
        fr: "Noter les tâches du lendemain vide votre esprit de la « boucle de rappel » qui vous réveille la nuit. Essayez une semaine et observez la différence." } },
    ],
  },
  {
    key: 'negative-thoughts',
    type: 'article',
    category: 'growth',
    minutes: 6,
    gradient: ['#F3E5D8', '#DDBB94'],
    author: { ar: 'د. سمير بن علي', fr: 'Dr Samir Benali' },
    title: { ar: 'التعامل مع الأفكار السلبية', fr: 'Gérer les pensées négatives' },
    summary: {
      ar: 'الفكرة ليست حقيقة: كيف تراجع أفكارك التلقائية؟',
      fr: 'Une pensée n’est pas un fait : comment questionner vos pensées automatiques ?',
    },
    body: [
      { type: 'p', text: {
        ar: 'الأفكار السلبية التلقائية تأتي سريعة ومقنعة: "سأفشل حتماً"، "الجميع يستاء مني". الخطوة الأولى هي ملاحظتها وتسميتها: "هذه فكرة، وليست حقيقة".',
        fr: "Les pensées négatives automatiques arrivent vite et semblent convaincantes : « je vais échouer », « tout le monde m'en veut ». La première étape : les remarquer et les nommer — « ceci est une pensée, pas un fait »." } },
      { type: 'p', text: {
        ar: 'ثم اسأل نفسك: ما الدليل مع هذه الفكرة؟ وما الدليل ضدها؟ ماذا سأقول لصديق راودته الفكرة نفسها؟ غالباً ستجد أن الواقع أرحم من الفكرة.',
        fr: "Puis demandez-vous : quelles preuves pour cette pensée ? Quelles preuves contre ? Que dirais-je à un ami qui aurait la même pensée ? La réalité est souvent plus clémente que la pensée." } },
    ],
  },
  {
    key: 'social-anxiety',
    type: 'article',
    category: 'anxiety',
    minutes: 6,
    gradient: ['#BFDCE5', '#8FBCCB'],
    author: { ar: 'د. نادية شريف', fr: 'Dr Nadia Cherif' },
    title: { ar: 'القلق الاجتماعي: خطوات أولى', fr: 'Anxiété sociale : premiers pas' },
    summary: {
      ar: 'مواجهة تدريجية ولطيفة للمواقف الاجتماعية المقلقة.',
      fr: 'Une exposition douce et progressive aux situations sociales redoutées.',
    },
    body: [
      { type: 'p', text: {
        ar: 'القلق الاجتماعي يجعلنا نتجنب المواقف، والتجنب يقوّي القلق. الحل هو سلّم تدريجي: ابدأ بموقف بسيط (سؤال بائع عن سعر)، وكرره حتى يفقد رهبته، ثم اصعد درجة.',
        fr: "L'anxiété sociale pousse à l'évitement, et l'évitement renforce l'anxiété. La solution : une échelle progressive. Commencez simple (demander un prix à un vendeur), répétez jusqu'à l'aisance, puis montez d'un cran." } },
      { type: 'p', text: {
        ar: 'قبل الموقف، لا تحاول إسكات التوتر؛ بل تقبّله كطاقة استعداد. وبعده، سجّل ما حدث فعلاً — ستكتشف أن أسوأ توقعاتك نادراً ما تتحقق.',
        fr: "Avant la situation, n'essayez pas d'étouffer le trac ; accueillez-le comme une énergie de préparation. Après, notez ce qui s'est réellement passé — vos pires prédictions se réalisent rarement." } },
    ],
  },
  {
    key: 'mindfulness-intro',
    type: 'article',
    category: 'growth',
    minutes: 8,
    gradient: ['#D8E8DC', '#A5C8AF'],
    author: { ar: 'فريق كلّمني', fr: 'Équipe Kalimni' },
    title: { ar: 'اليقظة الذهنية للمبتدئين', fr: 'La pleine conscience pour débutants' },
    summary: {
      ar: 'كيف تبدأ ممارسة الانتباه للحظة الحالية دون تعقيد.',
      fr: 'Comment commencer à porter attention au moment présent, simplement.',
    },
    body: [
      { type: 'p', text: {
        ar: 'اليقظة الذهنية ليست إفراغ العقل من الأفكار، بل ملاحظتها دون الانجرار وراءها. ابدأ بدقيقتين يومياً: اجلس، وركّز على إحساس التنفس عند أنفك.',
        fr: "La pleine conscience n'est pas vider l'esprit, mais observer les pensées sans se laisser emporter. Commencez par deux minutes par jour : asseyez-vous et concentrez-vous sur la sensation du souffle." } },
      { type: 'p', text: {
        ar: 'حين يشرد ذهنك — وسيشرد كثيراً — أعده بلطف إلى التنفس دون لوم. كل "إعادة" هي تمرين ناجح، تماماً كتكرار في النادي الرياضي.',
        fr: "Quand votre esprit s'égare — et il s'égarera souvent — ramenez-le doucement au souffle, sans jugement. Chaque « retour » est une répétition réussie, comme à la salle de sport." } },
      { type: 'exercise', exerciseKey: 'breathing478', text: {
        ar: 'ابدأ بتمرين تنفس موجّه', fr: 'Commencer par une respiration guidée' } },
    ],
  },
];

module.exports = { CONTENT_SEED };
