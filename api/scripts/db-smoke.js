// SQL-level verification of the Phase 0 security predicates against a REAL
// PostgreSQL (the unit suite covers routes/services with an in-memory fake;
// this covers the actual queries: ON CONFLICT ... WHERE, jsonb redaction).
//   node scripts/db-smoke.js     (needs DATABASE_URL / the dev docker DB)
// Creates its own rows under smoketest-marked ids and removes them after.
const repos = require('../src/data/repos');
const { pool } = require('../src/data/pg');

const ID = (p) => `${p}_smoketest_${Date.now().toString(36)}`;
let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

async function main() {
  const victimId = ID('u_victim');
  const attackerId = ID('u_attacker');
  const token = `ExponentPushToken[${ID('t')}]`;

  await repos.insertUser({ id: victimId, role: 'patient', name: 'Smoke Victim', email: `${victimId}@smoke.test`, passwordHash: '!' });
  await repos.insertUser({ id: attackerId, role: 'patient', name: 'Smoke Attacker', email: `${attackerId}@smoke.test`, passwordHash: '!' });

  try {
    // --- 0.5 push-token ownership predicates -------------------------------
    check('savePushToken registers a fresh token', await repos.savePushToken(victimId, token, 'android') === true);
    check('savePushToken refuses to re-parent a foreign token', await repos.savePushToken(attackerId, token, 'android') === false);
    let { rows } = await pool.query('SELECT user_id FROM push_tokens WHERE token = $1', [token]);
    check('foreign upsert left the owner unchanged', rows[0]?.user_id === victimId);

    check('owner refresh still works', await repos.savePushToken(victimId, token, 'ios') === true);

    await repos.deletePushTokenOwned(attackerId, token);
    ({ rows } = await pool.query('SELECT user_id FROM push_tokens WHERE token = $1', [token]));
    check('cross-user delete is a no-op', rows.length === 1);

    await repos.deletePushTokenOwned(victimId, token);
    ({ rows } = await pool.query('SELECT user_id FROM push_tokens WHERE token = $1', [token]));
    check('owner delete removes the row', rows.length === 0);

    // --- 0.3 crisis-hold data layer ----------------------------------------
    const conv = await repos.getOrCreateAiConversation(victimId);
    await repos.insertAiMessage({ conversationId: conv.id, role: 'user', text: 'smoke crisis text', risk: 'high' });
    const alert = await repos.insertSafetyAlert({
      patientId: victimId, source: 'ai_chat', status: 'open',
      detail: { risk: 'high', trigger: 'verbatim crisis excerpt', classifier: 'keyword' },
    });
    check('hasOpenAiAlert sees the open alert', await repos.hasOpenAiAlert(victimId) === true);

    await repos.deleteAiThread(victimId);
    check('thread row is gone', (await repos.getAiConversation(victimId)) === null);
    const after = await repos.findSafetyAlert(alert.id);
    check('alert row survives the wipe', !!after);
    check('trigger excerpt was redacted', after.detail.trigger === undefined && after.detail.triggerRedacted === true);
    check('risk level survives redaction', after.detail.risk === 'high');
    check('hasOpenAiAlert still true after wipe (hold source of truth)', await repos.hasOpenAiAlert(victimId) === true);

    // --- 0.4 / 0.6 message + transcript lookups ----------------------------
    const conv2 = await pool.query(
      `INSERT INTO conversations (id, patient_id, specialist_id) VALUES ($1, $2, $3) RETURNING id`,
      [ID('c'), victimId, attackerId]
    );
    const convId = conv2.rows[0].id;
    const msg = await repos.insertMessage({
      conversationId: convId, senderId: victimId, audioUrl: `/api/media/voice/${ID('vm')}.m4a`,
    });
    const found = await repos.findMessageByAudioUrl(msg.audioUrl);
    check('findMessageByAudioUrl resolves the owner message', found?.id === msg.id);

    await repos.saveVoiceTranscript({ messageId: msg.id, status: 'pending' });
    await repos.saveVoiceTranscript({ messageId: msg.id, text: 'transcribed text', status: 'done' });
    const transcripts = await repos.voiceTranscriptsOf(convId);
    check('voice transcript upsert + conversation join', transcripts.length === 1 && transcripts[0].text === 'transcribed text' && transcripts[0].status === 'done');

    // --- 1.1 escalation ladder SQL -----------------------------------------
    const nowIso = new Date().toISOString();
    const inHour = new Date(Date.now() + 3600_000).toISOString();
    const rota = await repos.insertOnCallRota({
      specialistId: attackerId, tier: 1, startsAt: nowIso, endsAt: inHour,
    });
    const onCall = await repos.onCallSpecialistsAt(new Date().toISOString(), 1);
    check('on-call rota window query finds the active entry', onCall.some((r) => r.id === rota.id));
    check('on-call rota tier filter works', (await repos.onCallSpecialistsAt(new Date().toISOString(), 2)).length === 0);

    const alert2 = await repos.insertSafetyAlert({
      patientId: victimId, source: 'chat', status: 'open',
    });
    await repos.insertAlertEscalation({ alertId: alert2.id, tier: 0, notifiedId: attackerId, method: 'page' });
    check('escalation audit row + wasNotifiedForAlert', await repos.wasNotifiedForAlert(alert2.id, attackerId));
    check('visibility follows the page (listSafetyAlertsVisibleTo)',
      (await repos.listSafetyAlertsVisibleTo(attackerId)).some((a) => a.id === alert2.id));
    check('critical list empty before tier 2', (await repos.listCriticalOpenAlerts()).length === 0);
    await repos.insertAlertEscalation({ alertId: alert2.id, tier: 2, notifiedId: null, method: 'critical' });
    check('critical list sees the tier-2 alert',
      (await repos.listCriticalOpenAlerts()).some((a) => a.id === alert2.id));
    await repos.ackAlertEscalations(alert2.id);
    const escRows = await repos.escalationsOf(alert2.id);
    check('ackAlertEscalations stamps every page row', escRows.every((e) => e.acknowledgedAt));

    // --- 1.2 dead-letter SQL -----------------------------------------------
    const f1 = await repos.upsertRiskScanFailure({ kind: 'chat', messageId: msg.id, error: 'first' });
    const f2 = await repos.upsertRiskScanFailure({ kind: 'chat', messageId: msg.id, error: 'second' });
    check('risk failure upsert bumps attempts on conflict', f1.id === f2.id && f2.attempts === 2);
    check('open failures listed', (await repos.openRiskScanFailures(10, 5)).some((f) => f.id === f1.id));
    await repos.resolveRiskScanFailure(f1.id);
    check('resolved failures leave the open count', (await repos.countOpenRiskScanFailures()) === 0);

    // --- 1.3 hold vs no-hold alert query ------------------------------------
    // Close the 0.3 section's ai_chat alert first: it has no detail.hold key,
    // so while open it would (correctly) read as a legacy hold.
    await repos.updateSafetyAlert(alert.id, { status: 'acknowledged' });
    const noHold = await repos.insertSafetyAlert({
      patientId: victimId, source: 'ai_chat', status: 'open',
      detail: { risk: 'none', hold: false, keywordHit: true },
    });
    check('hasOpenAiHoldAlert ignores cleared-keyword (hold:false) alerts',
      await repos.hasOpenAiHoldAlert(victimId) === false);
    check('hasOpenAiAlert still sees any open ai alert', await repos.hasOpenAiAlert(victimId) === true);
    const legacy = await repos.insertSafetyAlert({
      patientId: victimId, source: 'ai_chat', status: 'open', detail: { risk: 'high' }, // no hold key
    });
    check('legacy alerts without detail.hold imply a hold (COALESCE true)',
      await repos.hasOpenAiHoldAlert(victimId) === true);
    await repos.updateSafetyAlert(legacy.id, { status: 'acknowledged' });
    await repos.updateSafetyAlert(noHold.id, { status: 'acknowledged' });
    await repos.deleteOnCallRota(rota.id);
  } finally {
    await repos.deleteUserCascade(victimId).catch(() => {});
    await repos.deleteUserCascade(attackerId).catch(() => {});
  }

  console.log(failures === 0 ? '\nAll DB smoke checks passed.' : `\n${failures} CHECK(S) FAILED`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('[db-smoke] crashed:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
