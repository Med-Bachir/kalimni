// Creates the PostgreSQL schema and loads demo/test data.
//   npm run db:setup      (from api/; re-runnable, drops and recreates everything)
//
// Demo data: the same cast as the old in-memory seed (admin, two approved
// specialists, one pending, four patients, conversations, GAD-7/PHQ-9 results,
// matching requests in every status, the content library) PLUS extra rows the
// mock never had: call history in every outcome, a risk-flagged chat message
// with its open safety alert, and an acknowledged questionnaire alert.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const { pool } = require('../src/data/pg');
const repos = require('../src/data/repos');
const { numericUid } = require('../src/services/callService');
const { CONTENT_SEED } = require('../src/data/contentSeed');

const DEMO_PASSWORD = 'password123';

const daysAgo = (days, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

async function main() {
  console.log('[db:setup] applying schema...');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  console.log('[db:setup] seeding demo data...');
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 8);

  // --- Users -------------------------------------------------------------
  await repos.insertUser({
    role: 'admin', name: 'المشرف العام', email: 'admin@kalimni.app',
    passwordHash, language: 'ar', createdAt: daysAgo(90),
  });

  const samir = await repos.insertUser({
    role: 'specialist', name: 'د. سمير بن علي', email: 'samir@kalimni.app',
    passwordHash, language: 'ar', title: 'مختص نفسي', status: 'approved',
    specialties: ['anxiety', 'growth'], license: 'PSY-ALG-2417',
    bio: 'مختص نفسي عيادي، ١٢ سنة خبرة في اضطرابات القلق والعلاج المعرفي السلوكي.',
    createdAt: daysAgo(80),
  });

  const nadia = await repos.insertUser({
    role: 'specialist', name: 'د. نادية شريف', email: 'nadia@kalimni.app',
    passwordHash, language: 'fr', title: 'مختصة نفسية', status: 'approved',
    specialties: ['sleep', 'anxiety'], license: 'PSY-ALG-3082',
    bio: 'Psychologue clinicienne, spécialisée dans les troubles du sommeil et l’anxiété.',
    createdAt: daysAgo(75),
  });

  await repos.insertUser({
    role: 'specialist', name: 'د. هشام عمراني', email: 'hicham@kalimni.app',
    passwordHash, language: 'ar', title: 'مختص نفسي', status: 'pending',
    specialties: ['growth'], license: 'PSY-ALG-5511',
    bio: 'مختص في علم النفس العيادي، خريج جامعة الجزائر ٢.',
    createdAt: daysAgo(2),
  });

  const amina = await repos.insertUser({
    role: 'patient', name: 'أمينة بوزيد', email: 'amina@email.com',
    passwordHash, language: 'ar', assignedSpecialistId: samir.id,
    intakeCompletedAt: daysAgo(14), intakeSkipped: false, createdAt: daysAgo(15),
  });

  const yousef = await repos.insertUser({
    role: 'patient', name: 'يوسف مرابط', email: 'yousef@email.com',
    passwordHash, language: 'ar', assignedSpecialistId: samir.id,
    intakeCompletedAt: daysAgo(1), intakeSkipped: false, createdAt: daysAgo(1),
  });

  const leila = await repos.insertUser({
    role: 'patient', name: 'ليلى قاسمي', email: 'leila@email.com',
    passwordHash, language: 'ar', assignedSpecialistId: null,
    intakeCompletedAt: daysAgo(1), intakeSkipped: false, createdAt: daysAgo(2),
  });

  const karim = await repos.insertUser({
    role: 'patient', name: 'كريم دحماني', email: 'karim@email.com',
    passwordHash, language: 'fr', assignedSpecialistId: samir.id,
    intakeCompletedAt: daysAgo(20), intakeSkipped: false, createdAt: daysAgo(21),
  });

  // --- Questionnaire results ----------------------------------------------
  await repos.insertQuestionnaireResult({
    userId: amina.id, questionnaireId: 'gad7', score: 11, level: 'moderate',
    label: { ar: 'قلق متوسط', fr: 'Anxiété modérée' },
    answers: [2, 2, 1, 2, 1, 2, 1], crisisFlag: false, createdAt: daysAgo(14),
  });
  await repos.insertQuestionnaireResult({
    userId: amina.id, questionnaireId: 'phq9', score: 7, level: 'mild',
    label: { ar: 'أعراض خفيفة', fr: 'Symptômes légers' },
    answers: [1, 1, 1, 1, 1, 0, 1, 1, 0], crisisFlag: false, createdAt: daysAgo(14),
  });
  // A second, newer GAD-7 for Amina so the history screen shows a trend.
  await repos.insertQuestionnaireResult({
    userId: amina.id, questionnaireId: 'gad7', score: 8, level: 'mild',
    label: { ar: 'قلق خفيف', fr: 'Anxiété légère' },
    answers: [1, 1, 1, 2, 1, 1, 1], crisisFlag: false, createdAt: daysAgo(1),
  });
  await repos.insertQuestionnaireResult({
    userId: leila.id, questionnaireId: 'gad7', score: 12, level: 'moderate',
    label: { ar: 'قلق متوسط', fr: 'Anxiété modérée' },
    answers: [2, 2, 2, 2, 1, 2, 1], crisisFlag: false, createdAt: daysAgo(1),
  });
  await repos.insertQuestionnaireResult({
    userId: yousef.id, questionnaireId: 'gad7', score: 8, level: 'mild',
    label: { ar: 'قلق خفيف', fr: 'Anxiété légère' },
    answers: [1, 1, 2, 1, 1, 1, 1], crisisFlag: false, createdAt: daysAgo(1),
  });
  // PHQ-9 with item 9 > 0 -> crisis flag + acknowledged alert (test data).
  const karimPhq = await repos.insertQuestionnaireResult({
    userId: karim.id, questionnaireId: 'phq9', score: 16, level: 'moderately_severe',
    label: { ar: 'أعراض متوسطة إلى شديدة', fr: 'Symptômes modérément sévères' },
    answers: [2, 2, 2, 2, 2, 2, 1, 2, 1], crisisFlag: true, createdAt: daysAgo(20),
  });

  // --- Conversations & messages -------------------------------------------
  const convAmina = await repos.getOrCreateConversation(amina.id, samir.id);
  const aminaMsgs = [
    { from: samir.id, text: 'أهلاً أمينة، كيف كان أسبوعك؟ هل جرّبتِ التمرين الذي اتفقنا عليه؟', minute: 24, read: true },
    { from: amina.id, text: 'كان أفضل من السابق، جرّبت تمرين التنفس قبل النوم وساعدني كثيراً.', minute: 26, read: true },
    { from: amina.id, text: 'لكن ما زلت أشعر بالتوتر في العمل.', minute: 26, read: true },
    { from: samir.id, text: 'هذا تقدّم ممتاز 👏 سنركز في الجلسة القادمة على التوتر المرتبط بالعمل. هل يناسبك موعد يوم الخميس؟', minute: 31, read: false },
  ];
  for (const m of aminaMsgs) {
    await repos.insertMessage({
      conversationId: convAmina.id, senderId: m.from, text: m.text,
      createdAt: daysAgo(0, 10, m.minute),
      readAt: m.read ? daysAgo(0, 10, m.minute + 1) : null,
      riskFlag: false,
    });
  }

  const convYousef = await repos.getOrCreateConversation(yousef.id, samir.id);
  await repos.insertMessage({
    conversationId: convYousef.id, senderId: yousef.id,
    text: 'شكراً دكتور، سأحاول تطبيق ذلك.',
    createdAt: daysAgo(1, 18, 5), readAt: daysAgo(1, 18, 30), riskFlag: false,
  });
  // Risk-flagged message + OPEN safety alert (tests the alert badge/screen).
  const riskMsg = await repos.insertMessage({
    conversationId: convYousef.id, senderId: yousef.id,
    text: 'أحياناً أشعر أنني لا أريد العيش.',
    createdAt: daysAgo(0, 8, 40), readAt: null, riskFlag: true,
  });
  await repos.insertSafetyAlert({
    patientId: yousef.id, specialistId: samir.id, messageId: riskMsg.id,
    source: 'chat', status: 'open', createdAt: daysAgo(0, 8, 40),
  });

  const convKarim = await repos.getOrCreateConversation(karim.id, samir.id);
  await repos.insertMessage({
    conversationId: convKarim.id, senderId: samir.id,
    text: 'تم تحديد موعد الجلسة القادمة.',
    createdAt: daysAgo(4, 15, 0), readAt: daysAgo(4, 16, 0), riskFlag: false,
  });

  // Acknowledged questionnaire alert for Karim's old crisis-flagged PHQ-9.
  const karimAlert = await repos.insertSafetyAlert({
    patientId: karim.id, specialistId: samir.id, resultId: karimPhq.id,
    source: 'questionnaire', status: 'open', createdAt: daysAgo(20),
  });
  await repos.updateSafetyAlert(karimAlert.id, {
    status: 'acknowledged', acknowledgedBy: samir.id, acknowledgedAt: daysAgo(19),
  });

  // --- Matching requests (one per status, mirrors the admin design) --------
  await repos.insertMatchingRequest({
    patientId: amina.id, type: 'match', status: 'accepted',
    assignedSpecialistId: samir.id,
    context: { questionnaireId: 'gad7', score: 11, level: 'moderate' },
    createdAt: daysAgo(14), decidedAt: daysAgo(13),
  });
  await repos.insertMatchingRequest({
    patientId: yousef.id, type: 'match', status: 'review',
    context: { questionnaireId: 'gad7', score: 8, level: 'mild' },
    createdAt: daysAgo(1),
  });
  await repos.insertMatchingRequest({
    patientId: leila.id, type: 'match', status: 'new',
    requestedSpecialistId: nadia.id,
    context: { questionnaireId: 'gad7', score: 12, level: 'moderate' },
    createdAt: daysAgo(1),
  });
  await repos.insertMatchingRequest({
    patientId: karim.id, type: 'reassign', status: 'rejected',
    assignedSpecialistId: samir.id,
    note: 'طلب تغيير المختص — لا توجد أسباب سريرية للتغيير حالياً.',
    createdAt: daysAgo(6), decidedAt: daysAgo(5),
  });

  // --- Call history (every outcome, for the future history/log UI) ----------
  await repos.insertCall({
    conversationId: convAmina.id, callerId: amina.id, calleeId: samir.id,
    channel: `call_${convAmina.id}`,
    callerUid: numericUid(amina.id), calleeUid: numericUid(samir.id),
    status: 'ended', outcome: 'completed',
    createdAt: daysAgo(1, 17, 0), acceptedAt: daysAgo(1, 17, 0), endedAt: daysAgo(1, 17, 12),
  });
  await repos.insertCall({
    conversationId: convYousef.id, callerId: yousef.id, calleeId: samir.id,
    channel: `call_${convYousef.id}`,
    callerUid: numericUid(yousef.id), calleeUid: numericUid(samir.id),
    status: 'ended', outcome: 'missed',
    createdAt: daysAgo(2, 9, 30), endedAt: daysAgo(2, 9, 31),
  });
  await repos.insertCall({
    conversationId: convKarim.id, callerId: samir.id, calleeId: karim.id,
    channel: `call_${convKarim.id}`,
    callerUid: numericUid(samir.id), calleeUid: numericUid(karim.id),
    status: 'ended', outcome: 'rejected',
    createdAt: daysAgo(3, 14, 0), endedAt: daysAgo(3, 14, 0),
  });

  // --- Appointments ---------------------------------------------------------
  // A confirmed upcoming session (Amina) and one still awaiting Amina's reply.
  const inDays = (days, hour = 15, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  await repos.insertAppointment({
    conversationId: convAmina.id, patientId: amina.id, specialistId: samir.id,
    proposedBy: samir.id, scheduledAt: inDays(3, 16, 0), durationMin: 45, mode: 'call',
    status: 'confirmed', note: 'جلسة متابعة', createdAt: daysAgo(0, 10, 32), decidedAt: daysAgo(0, 10, 40),
  });
  await repos.insertAppointment({
    conversationId: convKarim.id, patientId: karim.id, specialistId: samir.id,
    proposedBy: samir.id, scheduledAt: inDays(2, 11, 0), durationMin: 45, mode: 'call',
    status: 'proposed', createdAt: daysAgo(0, 9, 0),
  });

  // --- Content library ------------------------------------------------------
  let i = 0;
  for (const item of CONTENT_SEED) {
    await repos.insertContent({ ...item, published: true, createdAt: daysAgo(30 - i) });
    i += 1;
  }

  const counts = (await pool.query(`
    SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM content)::int AS content,
      (SELECT count(*) FROM conversations)::int AS conversations,
      (SELECT count(*) FROM messages)::int AS messages,
      (SELECT count(*) FROM matching_requests)::int AS requests,
      (SELECT count(*) FROM safety_alerts)::int AS alerts,
      (SELECT count(*) FROM calls)::int AS calls,
      (SELECT count(*) FROM appointments)::int AS appointments
  `)).rows[0];
  console.log(
    `[db:setup] done — users=${counts.users} content=${counts.content} ` +
    `conversations=${counts.conversations} messages=${counts.messages} ` +
    `requests=${counts.requests} alerts=${counts.alerts} calls=${counts.calls} ` +
    `appointments=${counts.appointments}`
  );
  console.log(`[db:setup] demo password for every account: ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[db:setup] failed:', err);
  process.exit(1);
});
