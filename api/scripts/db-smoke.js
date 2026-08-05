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
    // Scoped to THIS alert, not the whole list: any database the escalation
    // worker has ever run against will legitimately hold tier-2 alerts, so a
    // global emptiness assertion fails on real data rather than on a bug.
    check('critical list excludes an alert that has not reached tier 2',
      !(await repos.listCriticalOpenAlerts()).some((a) => a.id === alert2.id));
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
    const openBefore = await repos.countOpenRiskScanFailures();
    await repos.resolveRiskScanFailure(f1.id);
    // Scoped to THIS failure, not to a global zero. Any real database holds
    // open dead letters — since Phase 2.5, permanently so for locked entries
    // that arrived unscanned — and asserting the global count is zero would
    // fail on correct data rather than on a bug.
    check('resolving one failure drops it from the open count',
      (await repos.countOpenRiskScanFailures()) === openBefore - 1
      && !(await repos.openRiskScanFailures(50, 5)).some((f) => f.id === f1.id));

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

    // --- 1.4 journal scanning SQL -------------------------------------------
    const entry = await repos.insertJournalEntry({
      userId: victimId, mood: 2, stress: 3, energy: 2, sleep: 3, note: 'smoke journal note',
    });
    check('journal entry lookup', (await repos.findJournalEntry(entry.id))?.id === entry.id);
    const journalAlert = await repos.insertSafetyAlert({
      patientId: victimId, source: 'journal', status: 'open',
      detail: { risk: 'high', journalEntryId: entry.id },
    });
    check('safety_alerts accepts source=journal', journalAlert.source === 'journal');
    await repos.updateSafetyAlert(journalAlert.id, { status: 'acknowledged' });
    const jf1 = await repos.upsertJournalScanFailure({ journalEntryId: entry.id, error: 'first' });
    const jf2 = await repos.upsertJournalScanFailure({ journalEntryId: entry.id, error: 'second' });
    check('journal dead-letter upsert bumps attempts', jf1.id === jf2.id && jf2.attempts === 2);
    check('journal dead-letter listed as open',
      (await repos.openRiskScanFailures(10, 5)).some((f) => f.id === jf1.id && f.kind === 'journal'));
    await repos.resolveRiskScanFailure(jf1.id);

    // --- 2.4 patient-owned companion memory --------------------------------
    // The upsert grew two columns and one non-COALESCE path; both only exist
    // in SQL, so the in-memory fake cannot prove either.
    const aiConv = await repos.getOrCreateAiConversation(victimId);
    await repos.upsertAiState(aiConv.id, {
      summary: 'line one. line two.', topics: ['a'], emotion: 'sadness', followUp: 'hello',
    });
    await repos.upsertAiState(aiConv.id, { summary: 'line one only.' });
    let aiState = await repos.getAiState(aiConv.id);
    check('partial upsert keeps emotion when only summary is written', aiState.emotion === 'sadness');
    await repos.upsertAiState(aiConv.id, {
      forgotten: [['token', 'bag']], editedAt: new Date().toISOString(),
    });
    aiState = await repos.getAiState(aiConv.id);
    check('forgotten bags round-trip as jsonb', aiState.forgotten?.[0]?.[1] === 'bag');
    check('edited_at records the patient rewrite', !!aiState.editedAt);
    check('writing forgotten did not clobber the summary', aiState.summary === 'line one only.');
    await repos.upsertAiState(aiConv.id, { summary: '', topics: [], followUp: '', clearEmotion: true });
    aiState = await repos.getAiState(aiConv.id);
    check('clearEmotion nulls a column COALESCE would have kept', aiState.emotion === null);
    check('empty string clears the summary (it is not NULL)', aiState.summary === '');
    check('forget-all left the forget list intact', aiState.forgotten?.length === 1);

    // --- 2.3 session briefs -------------------------------------------------
    const brief = await repos.insertSessionBrief({
      patientId: victimId, specialistId: attackerId,
      items: [{ id: 'notes', body: 'mine' }, { id: 'themes', body: 'generated' }],
    });
    check('new brief starts as a draft', brief.status === 'draft');
    check('openBriefDraftOf finds it', (await repos.openBriefDraftOf(victimId))?.id === brief.id);
    check('a draft is invisible to the specialist',
      (await repos.sharedBriefsFor(victimId, attackerId)).length === 0);
    await repos.updateSessionBrief(brief.id, {
      items: [{ id: 'notes', body: 'mine' }], status: 'shared', sharedAt: new Date().toISOString(),
    });
    const [seen] = await repos.sharedBriefsFor(victimId, attackerId);
    check('a shared brief reaches the treating specialist', seen?.id === brief.id);
    check('the unshared item is gone from the row, not filtered on read',
      seen.items.length === 1 && !JSON.stringify(seen.items).includes('generated'));
    check('another specialist sees nothing', (await repos.sharedBriefsFor(victimId, victimId)).length === 0);
    check('no draft remains once it is shared', (await repos.openBriefDraftOf(victimId)) === null);
    const second = await repos.insertSessionBrief({ patientId: victimId, specialistId: attackerId, items: [] });
    let oneDraftEnforced = false;
    try {
      await repos.insertSessionBrief({ patientId: victimId, specialistId: attackerId, items: [] });
    } catch (err) {
      oneDraftEnforced = /session_briefs_one_draft_idx/.test(err.message);
    }
    check('the partial unique index allows only one open draft', oneDraftEnforced);
    await repos.deleteSessionBrief(second.id);

    // --- 2.5 encrypted journal ----------------------------------------------
    const before = await repos.countUnscannedEncryptedEntries();
    const locked = await repos.insertJournalEntry({
      userId: victimId, mood: 3, stress: 3, energy: 3, sleep: 3,
      ciphertext: 'c1', nonce: 'n1', keyVersion: 1, encAlg: 'nacl.secretbox',
    });
    check('a locked entry stores ciphertext and no note', !locked.note && locked.ciphertext === 'c1');
    check('an entry with no attestation is counted as unseen',
      (await repos.countUnscannedEncryptedEntries()) === before + 1);

    // The bug this catches: writing scan={"status":"unverified"} makes the
    // column non-NULL, so a "WHERE scan IS NULL" count reports zero while the
    // gap is real. Found on live data.
    await repos.setJournalScan(locked.id, { status: 'unverified', reason: 'missing' });
    check('an UNVERIFIED attestation is still counted as unseen',
      (await repos.countUnscannedEncryptedEntries()) === before + 1);
    await repos.setJournalScan(locked.id, { status: 'verified', verdict: 'none' });
    check('a verified attestation clears it from the count',
      (await repos.countUnscannedEncryptedEntries()) === before);

    let bothRejected = false;
    try {
      await repos.insertJournalEntry({
        userId: victimId, mood: 3, stress: 3, energy: 3, sleep: 3,
        note: 'plain', ciphertext: 'c2', nonce: 'n2',
      });
    } catch (err) {
      bothRejected = /journal_entries_body_check/.test(err.message);
    }
    check('the column CHECK refuses plaintext and ciphertext on one row', bothRejected);

    await repos.insertJournalShare({
      entryId: locked.id, patientId: victimId, specialistId: attackerId,
      envelope: { ciphertext: 'sealed', nonce: 'n', senderPublicKey: 'pk' },
    });
    check('a share reaches only the specialist it was sealed to',
      (await repos.journalSharesFor(victimId, attackerId)).length === 1
      && (await repos.journalSharesFor(victimId, victimId)).length === 0);
    await repos.insertJournalShare({
      entryId: locked.id, patientId: victimId, specialistId: attackerId,
      envelope: { ciphertext: 'resealed', nonce: 'n', senderPublicKey: 'pk' },
    });
    const shares = await repos.journalSharesFor(victimId, attackerId);
    check('re-sharing replaces the envelope instead of stacking rows',
      shares.length === 1 && shares[0].envelope.ciphertext === 'resealed');
    await repos.deleteJournalShare(locked.id, victimId, attackerId);
    check('revoking removes it', (await repos.journalSharesFor(victimId, attackerId)).length === 0);

    await repos.upsertJournalRecovery(victimId, { method: 'phrase', wrappedKey: 'wrapped', keyVersion: 1 });
    check('recovery choice round-trips', (await repos.getJournalRecovery(victimId))?.method === 'phrase');
    let noneNeedsNoKey = true;
    try {
      await repos.upsertJournalRecovery(victimId, { method: 'none' });
    } catch { noneNeedsNoKey = false; }
    check('device-only recovery needs no wrapped key', noneNeedsNoKey);
    let escrowNeedsKey = false;
    try {
      await repos.upsertJournalRecovery(victimId, { method: 'escrow' });
    } catch (err) {
      escrowNeedsKey = /journal_recovery_check/.test(err.message);
    }
    check('a recoverable method without a key is refused by the CHECK', escrowNeedsKey);
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
