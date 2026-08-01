// Repositories: every SQL query in the API lives here, grouped by domain.
// Routes and services never touch the pool directly. Row shapes returned to
// callers are camelCased (see pg.js) and identical to the old mock DB objects.
//
// Some list endpoints intentionally run one query per row (specialist patient
// list, admin request list). At clinic scale this is fine and keeps the code
// readable; revisit with JOIN LATERAL if it ever shows up in profiles.
const { uid, j, all, one, run, tx } = require('./pg');

// Builds "SET col = $n" fragments from a camelCase patch, using only the
// whitelisted prop -> column pairs. jsonbProps are stringified for jsonb cols.
function buildSet(patch, map, jsonbProps = []) {
  const sets = [];
  const values = [];
  for (const [prop, col] of Object.entries(map)) {
    if (patch[prop] === undefined) continue;
    values.push(jsonbProps.includes(prop) ? j(patch[prop]) : patch[prop]);
    sets.push(`${col} = $${values.length}`);
  }
  return { sets, values };
}

// --- users -------------------------------------------------------------------

const findUserById = (id) => one('SELECT * FROM users WHERE id = $1', [id]);

const findUserByEmail = (email) =>
  one('SELECT * FROM users WHERE lower(email) = lower($1)', [String(email)]);

const insertUser = (u) =>
  one(
    `INSERT INTO users (id, role, name, email, password_hash, language, settings,
                        assigned_specialist_id, intake_completed_at, intake_skipped,
                        title, status, specialties, license, bio, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16, now()))
     RETURNING *`,
    [
      u.id || uid('u'), u.role, u.name, u.email, u.passwordHash, u.language || 'ar',
      j(u.settings || { notifications: true }), u.assignedSpecialistId || null,
      u.intakeCompletedAt || null, !!u.intakeSkipped, u.title || null, u.status || null,
      j(u.specialties || []), u.license || null, u.bio || null, u.createdAt || null,
    ]
  );

async function updateUser(id, patch) {
  const map = {
    name: 'name', language: 'language', settings: 'settings',
    assignedSpecialistId: 'assigned_specialist_id',
    intakeCompletedAt: 'intake_completed_at', intakeSkipped: 'intake_skipped',
    title: 'title', status: 'status', specialties: 'specialties',
    license: 'license', bio: 'bio',
  };
  const { sets, values } = buildSet(patch, map, ['settings', 'specialties']);
  if (!sets.length) return findUserById(id);
  values.push(id);
  return one(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
}

const listUsers = (role) =>
  role
    ? all('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', [role])
    : all('SELECT * FROM users ORDER BY created_at DESC');

const listPendingSpecialists = () =>
  all(`SELECT * FROM users WHERE role = 'specialist' AND status = 'pending' ORDER BY created_at`);

const listPatientsOf = (specialistId) =>
  all(`SELECT * FROM users WHERE role = 'patient' AND assigned_specialist_id = $1`, [specialistId]);

const listUnassignedPatients = () =>
  all(`SELECT * FROM users
       WHERE role = 'patient' AND assigned_specialist_id IS NULL
       ORDER BY created_at DESC`);

const listAdminIds = async () =>
  (await run(`SELECT id FROM users WHERE role = 'admin'`)).rows.map((r) => r.id);

// Account deletion (privacy requirement): messages are anonymized rather than
// deleted so the specialist's clinical record stays coherent; everything
// personal goes. Mirrors the old mock behavior, atomically.
const deleteUserCascade = (userId) =>
  tx(async (client) => {
    await client.query(`UPDATE messages SET sender_id = 'deleted' WHERE sender_id = $1`, [userId]);
    await client.query('DELETE FROM conversations WHERE patient_id = $1 OR specialist_id = $1', [userId]);
    await client.query('DELETE FROM questionnaire_results WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM matching_requests WHERE patient_id = $1', [userId]);
    await client.query('DELETE FROM safety_alerts WHERE patient_id = $1', [userId]);
    // AI companion thread + check-ins (ON DELETE CASCADE would cover these via
    // users, but explicit deletes keep the privacy contract visible here).
    await client.query('DELETE FROM ai_conversations WHERE patient_id = $1', [userId]);
    await client.query('DELETE FROM journal_entries WHERE user_id = $1', [userId]);
    await client.query('UPDATE users SET assigned_specialist_id = NULL WHERE assigned_specialist_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });

const adminStats = () =>
  one(`SELECT
    (SELECT count(*) FROM users WHERE role = 'patient')::int                                          AS patients,
    (SELECT count(*) FROM users WHERE role = 'patient'
       AND created_at > now() - interval '7 days')::int                                               AS patients_this_week,
    (SELECT count(*) FROM users WHERE role = 'patient' AND assigned_specialist_id IS NULL)::int       AS unassigned_patients,
    (SELECT count(*) FROM users WHERE role = 'specialist')::int                                       AS specialists,
    (SELECT count(*) FROM users WHERE role = 'specialist' AND status = 'pending')::int                AS pending_specialists,
    (SELECT count(*) FROM matching_requests WHERE status IN ('new', 'review'))::int                   AS active_requests,
    (SELECT count(*) FROM matching_requests WHERE created_at >= date_trunc('day', now()))::int        AS new_requests_today,
    (SELECT count(*) FROM safety_alerts WHERE status = 'open')::int                                   AS open_safety_alerts`);

// --- conversations -------------------------------------------------------------

const findConversation = (id) => one('SELECT * FROM conversations WHERE id = $1', [id]);

const listConversationsOf = (userId) =>
  all('SELECT * FROM conversations WHERE patient_id = $1 OR specialist_id = $1', [userId]);

const findConversationBetween = (patientId, specialistId) =>
  one('SELECT * FROM conversations WHERE patient_id = $1 AND specialist_id = $2', [patientId, specialistId]);

async function getOrCreateConversation(patientId, specialistId) {
  await run(
    `INSERT INTO conversations (id, patient_id, specialist_id)
     VALUES ($1, $2, $3) ON CONFLICT (patient_id, specialist_id) DO NOTHING`,
    [uid('c'), patientId, specialistId]
  );
  return findConversationBetween(patientId, specialistId);
}

// --- messages ------------------------------------------------------------------

const insertMessage = (m) =>
  one(
    `INSERT INTO messages (id, conversation_id, sender_id, text, audio_url, audio_duration_ms,
                           risk_flag, read_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
     RETURNING *`,
    [
      m.id || uid('m'), m.conversationId, m.senderId, m.text || '',
      m.audioUrl || null, m.audioDurationMs || null,
      !!m.riskFlag, m.readAt || null, m.createdAt || null,
    ]
  );

// Audio files of a user's voice messages (disk cleanup on account deletion).
const audioUrlsOfSender = async (senderId) =>
  (await run('SELECT audio_url FROM messages WHERE sender_id = $1 AND audio_url IS NOT NULL', [senderId]))
    .rows.map((r) => r.audio_url);

const findMessage = (id) => one('SELECT * FROM messages WHERE id = $1', [id]);

// Ownership lookup for the media route: which message carries this voice file?
const findMessageByAudioUrl = (audioUrl) =>
  one('SELECT * FROM messages WHERE audio_url = $1 LIMIT 1', [audioUrl]);

// Used by the async LLM risk layer when it catches what keywords missed.
const setMessageRiskFlag = (id) =>
  one('UPDATE messages SET risk_flag = true WHERE id = $1 RETURNING *', [id]);

const messagesOf = (conversationId) =>
  all('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at', [conversationId]);

const lastMessageOf = (conversationId) =>
  one('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1', [conversationId]);

const unreadCountFor = async (conversationId, userId) =>
  (await run(
    `SELECT count(*)::int AS n FROM messages
     WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
    [conversationId, userId]
  )).rows[0].n;

async function markConversationRead(conversationId, readerId) {
  const res = await run(
    `UPDATE messages SET read_at = now()
     WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL
     RETURNING read_at`,
    [conversationId, readerId]
  );
  return {
    changed: res.rowCount,
    readAt: res.rows[0] ? res.rows[0].read_at.toISOString() : null,
  };
}

// --- voice transcripts -----------------------------------------------------------
// Safety-net transcripts of voice notes. Specialist-eyes-only by design: they
// are joined into responses ONLY by the specialist read path, never serialized
// with the message row itself (see db/migrations/002 for the rationale).

const saveVoiceTranscript = ({ messageId, text, status }) =>
  one(
    `INSERT INTO voice_transcripts (message_id, text, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id) DO UPDATE SET text = $2, status = $3
     RETURNING *`,
    [messageId, text || null, status]
  );

const voiceTranscriptsOf = (conversationId) =>
  all(
    `SELECT vt.* FROM voice_transcripts vt
     JOIN messages m ON m.id = vt.message_id
     WHERE m.conversation_id = $1`,
    [conversationId]
  );

const getVoiceTranscript = (messageId) =>
  one('SELECT * FROM voice_transcripts WHERE message_id = $1', [messageId]);

// --- questionnaire results -------------------------------------------------------

const insertQuestionnaireResult = (r) =>
  one(
    `INSERT INTO questionnaire_results (id, user_id, questionnaire_id, score, level, label, answers, crisis_flag, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
     RETURNING *`,
    [
      r.id || uid('qr'), r.userId, r.questionnaireId, r.score, r.level,
      j(r.label), j(r.answers), !!r.crisisFlag, r.createdAt || null,
    ]
  );

const resultsOf = (userId) =>
  all('SELECT * FROM questionnaire_results WHERE user_id = $1 ORDER BY created_at DESC', [userId]);

const latestResultOf = (userId) =>
  one('SELECT * FROM questionnaire_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);

// Latest result per questionnaire (gad7 AND phq9) — the patient's "case".
const latestResultsByQuestionnaire = (userId) =>
  all(
    `SELECT DISTINCT ON (questionnaire_id) *
     FROM questionnaire_results WHERE user_id = $1
     ORDER BY questionnaire_id, created_at DESC`,
    [userId]
  );

// --- matching requests -----------------------------------------------------------

const insertMatchingRequest = (r) =>
  one(
    `INSERT INTO matching_requests (id, patient_id, type, status, assigned_specialist_id,
                                    requested_specialist_id, note, context, created_at, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10)
     RETURNING *`,
    [
      r.id || uid('mr'), r.patientId, r.type || 'match', r.status || 'new',
      r.assignedSpecialistId || null, r.requestedSpecialistId || null,
      r.note || null, j(r.context), r.createdAt || null, r.decidedAt || null,
    ]
  );

const findMatchingRequest = (id) => one('SELECT * FROM matching_requests WHERE id = $1', [id]);

async function updateMatchingRequest(id, patch) {
  const map = { status: 'status', assignedSpecialistId: 'assigned_specialist_id', decidedAt: 'decided_at' };
  const { sets, values } = buildSet(patch, map);
  if (!sets.length) return findMatchingRequest(id);
  values.push(id);
  return one(`UPDATE matching_requests SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
}

const listMatchingRequests = (status) =>
  status
    ? all('SELECT * FROM matching_requests WHERE status = $1 ORDER BY created_at DESC', [status])
    : all('SELECT * FROM matching_requests ORDER BY created_at DESC');

const openMatchingRequestOf = (patientId) =>
  one(
    `SELECT * FROM matching_requests
     WHERE patient_id = $1 AND status IN ('new', 'review')
     ORDER BY created_at DESC LIMIT 1`,
    [patientId]
  );

const hasOpenMatchingRequest = async (patientId) =>
  (await run(
    `SELECT 1 FROM matching_requests WHERE patient_id = $1 AND status IN ('new', 'review') LIMIT 1`,
    [patientId]
  )).rowCount > 0;

const latestAcceptedRequestOf = (patientId) =>
  one(
    `SELECT * FROM matching_requests WHERE patient_id = $1 AND status = 'accepted'
     ORDER BY decided_at DESC NULLS LAST LIMIT 1`,
    [patientId]
  );

// --- content ---------------------------------------------------------------------

async function listContent({ category, type, q, includeUnpublished } = {}) {
  const where = [];
  const values = [];
  if (!includeUnpublished) where.push('published = true');
  if (category && category !== 'all') {
    values.push(category);
    where.push(`category = $${values.length}`);
  }
  if (type) {
    values.push(type);
    where.push(`type = $${values.length}`);
  }
  if (q) {
    values.push(`%${String(q)}%`);
    const n = `$${values.length}`;
    where.push(`(title->>'ar' ILIKE ${n} OR title->>'fr' ILIKE ${n}
              OR summary->>'ar' ILIKE ${n} OR summary->>'fr' ILIKE ${n})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return all(`SELECT * FROM content ${clause} ORDER BY featured DESC, created_at DESC`, values);
}

const findContent = (id) => one('SELECT * FROM content WHERE id = $1', [id]);

const insertContent = (c) =>
  one(
    `INSERT INTO content (id, key, type, category, featured, minutes, gradient, author,
                          title, summary, body, exercise_key, published, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, now()))
     RETURNING *`,
    [
      c.id || uid('ct'), c.key || null, c.type, c.category, !!c.featured, c.minutes,
      j(c.gradient || ['#BFDCE5', '#8FBCCB']),
      j(c.author || { ar: 'فريق كلّمني', fr: 'Équipe Kalimni' }),
      j(c.title), j(c.summary), j(c.body || []),
      c.exerciseKey || null, c.published !== false, c.createdAt || null,
    ]
  );

async function updateContent(id, patch) {
  const map = {
    type: 'type', category: 'category', minutes: 'minutes', title: 'title',
    summary: 'summary', body: 'body', author: 'author', gradient: 'gradient',
    featured: 'featured', published: 'published', exerciseKey: 'exercise_key',
  };
  const { sets, values } = buildSet(patch, map, ['title', 'summary', 'body', 'author', 'gradient']);
  if (!sets.length) return findContent(id);
  values.push(id);
  return one(`UPDATE content SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
}

const deleteContent = async (id) =>
  (await run('DELETE FROM content WHERE id = $1', [id])).rowCount > 0;

// --- safety alerts -----------------------------------------------------------------

const insertSafetyAlert = (a) =>
  one(
    `INSERT INTO safety_alerts (id, patient_id, specialist_id, message_id, result_id, source, status, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
     RETURNING *`,
    [
      a.id || uid('sa'), a.patientId, a.specialistId || null, a.messageId || null,
      a.resultId || null, a.source, a.status || 'open', j(a.detail), a.createdAt || null,
    ]
  );

const findSafetyAlert = (id) => one('SELECT * FROM safety_alerts WHERE id = $1', [id]);

const listSafetyAlerts = (specialistId) =>
  specialistId
    ? all('SELECT * FROM safety_alerts WHERE specialist_id = $1 ORDER BY created_at DESC', [specialistId])
    : all('SELECT * FROM safety_alerts ORDER BY created_at DESC');

async function updateSafetyAlert(id, patch) {
  const map = { status: 'status', acknowledgedBy: 'acknowledged_by', acknowledgedAt: 'acknowledged_at' };
  const { sets, values } = buildSet(patch, map);
  if (!sets.length) return findSafetyAlert(id);
  values.push(id);
  return one(`UPDATE safety_alerts SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
}

const countOpenAlertsOf = async (patientId) =>
  (await run(
    `SELECT count(*)::int AS n FROM safety_alerts WHERE patient_id = $1 AND status = 'open'`,
    [patientId]
  )).rows[0].n;

const openSafetyAlerts = () =>
  all(`SELECT * FROM safety_alerts WHERE status = 'open' ORDER BY created_at`);

// What a specialist may see: alerts where they are the treating clinician OR
// were paged for it (on-call cover for unassigned patients — the audit rows
// in alert_escalations are the source of that grant).
const listSafetyAlertsVisibleTo = (specialistId) =>
  all(
    `SELECT DISTINCT sa.* FROM safety_alerts sa
     LEFT JOIN alert_escalations ae ON ae.alert_id = sa.id
     WHERE sa.specialist_id = $1 OR ae.notified_id = $1
     ORDER BY sa.created_at DESC`,
    [specialistId]
  );

// Open alerts that reached tier 2 (60 min unacknowledged) — the admin
// dashboard banner that cannot be dismissed while any of these exist.
const listCriticalOpenAlerts = () =>
  all(
    `SELECT DISTINCT sa.* FROM safety_alerts sa
     JOIN alert_escalations ae ON ae.alert_id = sa.id AND ae.tier = 2
     WHERE sa.status = 'open'
     ORDER BY sa.created_at`
  );

// --- on-call rota (escalation ladder, Phase 1.1) ---------------------------------

const insertOnCallRota = (r) =>
  one(
    `INSERT INTO on_call_rota (id, specialist_id, tier, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [r.id || uid('rota'), r.specialistId, r.tier || 1, r.startsAt, r.endsAt]
  );

const deleteOnCallRota = async (id) =>
  (await run('DELETE FROM on_call_rota WHERE id = $1', [id])).rowCount > 0;

// Current + upcoming entries (admin management view).
const listOnCallRota = () =>
  all(`SELECT * FROM on_call_rota WHERE ends_at > now() ORDER BY starts_at, tier`);

// Specialists covering `at` for the given tier, most recent shift first.
const onCallSpecialistsAt = (at, tier) =>
  all(
    `SELECT * FROM on_call_rota
     WHERE tier = $2 AND starts_at <= $1 AND ends_at > $1
     ORDER BY starts_at DESC`,
    [at, tier]
  );

// --- alert escalations (append-only page audit) ----------------------------------

const insertAlertEscalation = (e) =>
  one(
    `INSERT INTO alert_escalations (id, alert_id, tier, notified_id, method, action_taken, notified_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now())) RETURNING *`,
    [e.id || uid('esc'), e.alertId, e.tier, e.notifiedId || null, e.method, e.actionTaken || null, e.notifiedAt || null]
  );

const escalationsOf = (alertId) =>
  all('SELECT * FROM alert_escalations WHERE alert_id = $1 ORDER BY notified_at', [alertId]);

// Was this user ever paged for this alert? (grants ack rights to on-call cover)
const wasNotifiedForAlert = async (alertId, userId) =>
  (await run(
    'SELECT 1 FROM alert_escalations WHERE alert_id = $1 AND notified_id = $2 LIMIT 1',
    [alertId, userId]
  )).rowCount > 0;

// Stamp every page row of the alert as acknowledged (audit closure).
const ackAlertEscalations = (alertId, at) =>
  run(
    `UPDATE alert_escalations SET acknowledged_at = COALESCE($2, now())
     WHERE alert_id = $1 AND acknowledged_at IS NULL`,
    [alertId, at || null]
  );

// --- risk scan dead letters (Phase 1.2 / 1.4) ------------------------------------

// One row per message; repeated failures bump attempts.
const upsertRiskScanFailure = ({ kind, messageId, error }) =>
  one(
    `INSERT INTO risk_scan_failures (id, kind, message_id, last_error)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (message_id) DO UPDATE SET
       attempts = risk_scan_failures.attempts + 1,
       last_error = $4,
       retried_at = now()
     RETURNING *`,
    [uid('rsf'), kind, messageId, String(error || '').slice(0, 500)]
  );

// Journal-note counterpart (one row per entry).
const upsertJournalScanFailure = ({ journalEntryId, error }) =>
  one(
    `INSERT INTO risk_scan_failures (id, kind, journal_entry_id, last_error)
     VALUES ($1, 'journal', $2, $3)
     ON CONFLICT (journal_entry_id) DO UPDATE SET
       attempts = risk_scan_failures.attempts + 1,
       last_error = $3,
       retried_at = now()
     RETURNING *`,
    [uid('rsf'), journalEntryId, String(error || '').slice(0, 500)]
  );

const openRiskScanFailures = (limit = 10, maxAttempts = 5) =>
  all(
    `SELECT * FROM risk_scan_failures
     WHERE resolved_at IS NULL AND attempts < $2
     ORDER BY created_at LIMIT $1`,
    [limit, maxAttempts]
  );

const resolveRiskScanFailure = (id) =>
  run('UPDATE risk_scan_failures SET resolved_at = now() WHERE id = $1', [id]);

const countOpenRiskScanFailures = async () =>
  (await run('SELECT count(*)::int AS n FROM risk_scan_failures WHERE resolved_at IS NULL')).rows[0].n;

// --- calls -----------------------------------------------------------------------

const insertCall = (c) =>
  one(
    `INSERT INTO calls (id, conversation_id, caller_id, callee_id, channel, media,
                        caller_uid, callee_uid, status, outcome, created_at, accepted_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, now()), $12, $13)
     RETURNING *`,
    [
      c.id || uid('call'), c.conversationId, c.callerId, c.calleeId, c.channel,
      c.media || 'voice', c.callerUid, c.calleeUid, c.status || 'ringing', c.outcome || null,
      c.createdAt || null, c.acceptedAt || null, c.endedAt || null,
    ]
  );

const findCall = (id) => one('SELECT * FROM calls WHERE id = $1', [id]);

const findActiveCall = (conversationId) =>
  one(
    `SELECT * FROM calls WHERE conversation_id = $1 AND status IN ('ringing', 'active') LIMIT 1`,
    [conversationId]
  );

async function updateCall(id, patch) {
  const map = { status: 'status', outcome: 'outcome', acceptedAt: 'accepted_at', endedAt: 'ended_at' };
  const { sets, values } = buildSet(patch, map);
  if (!sets.length) return findCall(id);
  values.push(id);
  return one(`UPDATE calls SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
}

// --- appointments ----------------------------------------------------------------

const insertAppointment = (a) =>
  one(
    `INSERT INTO appointments (id, conversation_id, patient_id, specialist_id, proposed_by,
                              scheduled_at, duration_min, mode, status, note, created_at, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, now()), $12)
     RETURNING *`,
    [
      a.id || uid('apt'), a.conversationId, a.patientId, a.specialistId, a.proposedBy,
      a.scheduledAt, a.durationMin || 45, a.mode || 'call', a.status || 'proposed',
      a.note || null, a.createdAt || null, a.decidedAt || null,
    ]
  );

const findAppointment = (id) => one('SELECT * FROM appointments WHERE id = $1', [id]);

async function updateAppointment(id, patch) {
  const map = { scheduledAt: 'scheduled_at', durationMin: 'duration_min', mode: 'mode',
    status: 'status', note: 'note', decidedAt: 'decided_at' };
  const { sets, values } = buildSet(patch, map);
  if (!sets.length) return findAppointment(id);
  values.push(id);
  return one(`UPDATE appointments SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
}

const appointmentsOfConversation = (conversationId) =>
  all('SELECT * FROM appointments WHERE conversation_id = $1 ORDER BY scheduled_at DESC', [conversationId]);

// Upcoming = confirmed or still-proposed, in the future, soonest first.
const upcomingAppointmentsOf = (userId) =>
  all(
    `SELECT * FROM appointments
     WHERE (patient_id = $1 OR specialist_id = $1)
       AND status IN ('proposed', 'confirmed')
       AND scheduled_at > now() - interval '1 hour'
     ORDER BY scheduled_at ASC`,
    [userId]
  );

// The single next session to surface on a home/patient card (confirmed wins).
const nextAppointmentOf = (userId) =>
  one(
    `SELECT * FROM appointments
     WHERE (patient_id = $1 OR specialist_id = $1)
       AND status IN ('proposed', 'confirmed')
       AND scheduled_at > now() - interval '1 hour'
     ORDER BY (status = 'confirmed') DESC, scheduled_at ASC
     LIMIT 1`,
    [userId]
  );

const nextAppointmentForConversation = (conversationId) =>
  one(
    `SELECT * FROM appointments
     WHERE conversation_id = $1
       AND status IN ('proposed', 'confirmed')
       AND scheduled_at > now() - interval '1 hour'
     ORDER BY (status = 'confirmed') DESC, scheduled_at ASC
     LIMIT 1`,
    [conversationId]
  );

// A conversation can hold at most one open (proposed/confirmed future) slot.
const hasOpenAppointment = async (conversationId) =>
  (await run(
    `SELECT 1 FROM appointments
     WHERE conversation_id = $1 AND status IN ('proposed', 'confirmed')
       AND scheduled_at > now() - interval '1 hour' LIMIT 1`,
    [conversationId]
  )).rowCount > 0;

// --- push tokens -------------------------------------------------------------------

// Upsert: a device token can move between accounts (logout/login on the same
// phone), so the token owns the row and user_id follows it.
// --- AI companion ------------------------------------------------------------

// One persistent AI thread per patient; created lazily on first use.
async function getOrCreateAiConversation(patientId) {
  await run(
    `INSERT INTO ai_conversations (id, patient_id) VALUES ($1, $2)
     ON CONFLICT (patient_id) DO NOTHING`,
    [uid('aic'), patientId]
  );
  return one('SELECT * FROM ai_conversations WHERE patient_id = $1', [patientId]);
}

// Read-only counterpart: the home screen asks about the thread on every load
// and must not create one for a patient who has never opened the companion.
const getAiConversation = (patientId) =>
  one('SELECT * FROM ai_conversations WHERE patient_id = $1', [patientId]);

// Newest message timestamp, for staleness gating (null when the thread is empty).
const lastAiMessageAt = async (conversationId) =>
  (await one('SELECT max(created_at) AS at FROM ai_messages WHERE conversation_id = $1', [
    conversationId,
  ]))?.at || null;

const setAiConversationStatus = (id, status) =>
  one('UPDATE ai_conversations SET status = $2 WHERE id = $1 RETURNING *', [id, status]);

const insertAiMessage = (m) =>
  one(
    `INSERT INTO ai_messages (id, conversation_id, role, text, risk, suggestions)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [m.id || uid('aim'), m.conversationId, m.role, m.text, m.risk || 'none', j(m.suggestions || [])]
  );

// Last `limit` messages in chronological order.
const aiMessagesOf = (conversationId, limit = 50) =>
  all(
    `SELECT * FROM (
       SELECT * FROM ai_messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT $2
     ) t ORDER BY created_at ASC`,
    [conversationId, limit]
  );

const getAiState = (conversationId) =>
  one('SELECT * FROM ai_state WHERE conversation_id = $1', [conversationId]);

// Partial upsert: null/undefined fields keep their stored value.
const upsertAiState = (
  conversationId,
  { summary, topics, emotion, followUp, messagesSinceSummary } = {}
) =>
  one(
    `INSERT INTO ai_state (conversation_id, summary, topics, emotion, follow_up, messages_since_summary)
     VALUES ($1, COALESCE($2, ''), COALESCE($3::jsonb, '[]'::jsonb), $4, $5, COALESCE($6, 0))
     ON CONFLICT (conversation_id) DO UPDATE SET
       summary                = COALESCE($2, ai_state.summary),
       topics                 = COALESCE($3::jsonb, ai_state.topics),
       emotion                = COALESCE($4, ai_state.emotion),
       follow_up              = COALESCE($5, ai_state.follow_up),
       messages_since_summary = COALESCE($6, ai_state.messages_since_summary),
       updated_at             = now()
     RETURNING *`,
    [
      conversationId, summary ?? null, topics === undefined ? null : j(topics),
      emotion ?? null, followUp ?? null, messagesSinceSummary ?? null,
    ]
  );

const bumpAiMessageCount = (conversationId, by = 1) =>
  one(
    `INSERT INTO ai_state (conversation_id, messages_since_summary) VALUES ($1, $2)
     ON CONFLICT (conversation_id) DO UPDATE
       SET messages_since_summary = ai_state.messages_since_summary + $2, updated_at = now()
     RETURNING *`,
    [conversationId, by]
  );

// Privacy: patient wipes their whole AI thread (messages + state cascade).
// Alert rows survive as the clinical record, but detail.trigger is a verbatim
// excerpt of the patient's own crisis message — "wipe my thread" must cover
// it, so it is redacted here (risk level + classifier reason stay). Routes
// refuse the wipe while an ai_chat alert is still OPEN, so a specialist never
// loses the excerpt before having reviewed it.
const deleteAiThread = (patientId) =>
  tx(async (client) => {
    await client.query(
      `UPDATE safety_alerts
       SET detail = (detail - 'trigger') || '{"triggerRedacted": true}'::jsonb
       WHERE patient_id = $1 AND source = 'ai_chat' AND detail ? 'trigger'`,
      [patientId]
    );
    await client.query('DELETE FROM ai_conversations WHERE patient_id = $1', [patientId]);
  });

// Any open AI alert at all (suppresses the home-screen follow-up question).
const hasOpenAiAlert = async (patientId) =>
  (await run(
    `SELECT 1 FROM safety_alerts
     WHERE patient_id = $1 AND source = 'ai_chat' AND status = 'open' LIMIT 1`,
    [patientId]
  )).rowCount > 0;

// crisis_hold source of truth: an open AI alert that DEMANDED a hold. Alerts
// where the classifier cleared a keyword hit carry detail.hold=false and page
// the specialist without pausing support (Phase 1.3). Alerts created before
// the split have no detail.hold — they always implied a hold, so missing
// defaults to true.
const hasOpenAiHoldAlert = async (patientId) =>
  (await run(
    `SELECT 1 FROM safety_alerts
     WHERE patient_id = $1 AND source = 'ai_chat' AND status = 'open'
       AND COALESCE((detail->>'hold')::boolean, true)
     LIMIT 1`,
    [patientId]
  )).rowCount > 0;

// --- journal / daily check-in --------------------------------------------------

const insertJournalEntry = (e) =>
  one(
    `INSERT INTO journal_entries (id, user_id, mood, stress, energy, sleep, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [e.id || uid('je'), e.userId, e.mood, e.stress, e.energy, e.sleep, e.note || null]
  );

const findJournalEntry = (id) => one('SELECT * FROM journal_entries WHERE id = $1', [id]);

const journalEntriesOf = (userId, limit = 30) =>
  all(
    'SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );

// Lifetime count, separate from the windowed list above: the journey milestones
// never reset, so they can't be derived from a LIMITed page of rows.
const journalEntryCountOf = (userId) =>
  one('SELECT count(*)::int AS total FROM journal_entries WHERE user_id = $1', [userId]);

// Register/refresh this device's token. The ON CONFLICT update touches only
// rows the caller already owns: knowing a token string must never be enough to
// re-parent another user's device (that would silently redirect their pushes —
// including safety-alert pages — to nobody). The logout/login-on-a-shared-phone
// case is handled by the client deleting the token on logout, not by letting
// any account claim any token. Returns false when the token belongs to
// someone else.
const savePushToken = async (userId, token, platform) =>
  (await run(
    `INSERT INTO push_tokens (token, user_id, platform, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (token) DO UPDATE SET platform = $3, updated_at = now()
     WHERE push_tokens.user_id = $2`,
    [token, userId, platform || null]
  )).rowCount > 0;

// User-initiated delete (logout): only the owner can remove a token.
const deletePushTokenOwned = (userId, token) =>
  run('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, userId]);

// Server-initiated delete: Expo reported the device token dead
// (DeviceNotRegistered) — no user context, trusted caller (pushService only).
const deletePushToken = (token) => run('DELETE FROM push_tokens WHERE token = $1', [token]);

// Tokens joined with the owner's language + settings so the push layer can
// localize text and respect the notifications toggle without extra queries.
const pushTargetsOf = (userIds) =>
  all(
    `SELECT pt.token, pt.user_id, u.language, u.settings
     FROM push_tokens pt JOIN users u ON u.id = pt.user_id
     WHERE pt.user_id = ANY($1)`,
    [userIds]
  );

module.exports = {
  // users
  findUserById, findUserByEmail, insertUser, updateUser, listUsers,
  listPendingSpecialists, listPatientsOf, listUnassignedPatients, listAdminIds, deleteUserCascade, adminStats,
  // conversations
  findConversation, listConversationsOf, findConversationBetween, getOrCreateConversation,
  // messages
  insertMessage, findMessage, findMessageByAudioUrl, setMessageRiskFlag, messagesOf, lastMessageOf,
  unreadCountFor, markConversationRead, audioUrlsOfSender,
  // voice transcripts
  saveVoiceTranscript, voiceTranscriptsOf, getVoiceTranscript,
  // questionnaire results
  insertQuestionnaireResult, resultsOf, latestResultOf, latestResultsByQuestionnaire,
  // matching requests
  insertMatchingRequest, findMatchingRequest, updateMatchingRequest,
  listMatchingRequests, hasOpenMatchingRequest, openMatchingRequestOf, latestAcceptedRequestOf,
  // content
  listContent, findContent, insertContent, updateContent, deleteContent,
  // safety alerts
  insertSafetyAlert, findSafetyAlert, listSafetyAlerts, updateSafetyAlert, countOpenAlertsOf,
  openSafetyAlerts, listSafetyAlertsVisibleTo, listCriticalOpenAlerts,
  // escalation ladder
  insertOnCallRota, deleteOnCallRota, listOnCallRota, onCallSpecialistsAt,
  insertAlertEscalation, escalationsOf, wasNotifiedForAlert, ackAlertEscalations,
  // risk scan dead letters
  upsertRiskScanFailure, upsertJournalScanFailure, openRiskScanFailures,
  resolveRiskScanFailure, countOpenRiskScanFailures,
  // calls
  insertCall, findCall, findActiveCall, updateCall,
  // appointments
  insertAppointment, findAppointment, updateAppointment, appointmentsOfConversation,
  upcomingAppointmentsOf, nextAppointmentOf, nextAppointmentForConversation, hasOpenAppointment,
  // push tokens
  savePushToken, deletePushToken, deletePushTokenOwned, pushTargetsOf,
  // AI companion
  getOrCreateAiConversation, getAiConversation, lastAiMessageAt,
  setAiConversationStatus, insertAiMessage, aiMessagesOf,
  getAiState, upsertAiState, bumpAiMessageCount, deleteAiThread, hasOpenAiAlert, hasOpenAiHoldAlert,
  // journal / daily check-in
  insertJournalEntry, findJournalEntry, journalEntriesOf, journalEntryCountOf,
};
