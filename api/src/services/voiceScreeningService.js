// Safety screening for voice messages (Phase 0.6). Voice notes carry no text,
// so the keyword scan and the LLM classifier were blind to them — a patient
// who RECORDS a suicidal message instead of typing it triggered nothing. This
// service closes that gap: transcribe on upload, then run the transcript
// through the exact same two layers as typed text.
//
// Fire-and-forget from chatService (the message is already delivered); every
// outcome is recorded in voice_transcripts so an unscreened voice note is
// VISIBLY unscreened in the specialist UI rather than silently green.
//
// The transcript is specialist-eyes-only: it is machine output, and must never
// be shown back to the patient as if it were their words.
const repos = require('../data/repos');
const transcription = require('./transcriptionService');
const risk = require('./riskService');
const { scanForRisk } = require('../utils/safety');
const { emitToUser } = require('../realtime');
const alerts = require('./alertService');

// Returns true when screening concluded, false when it failed (dead-lettered).
async function screenVoiceMessageAsync({ message, sender, conversation, filePath }) {
  if (sender.role !== 'patient') return true; // same rule as text: only patient risk is scanned

  try {
    // Record the screening state up front, so a voice note is never silently
    // unscreened: the specialist view shows pending/unavailable immediately.
    if (!transcription.isConfigured()) {
      await repos.saveVoiceTranscript({ messageId: message.id, status: 'unavailable' });
      return true;
    }
    await repos.saveVoiceTranscript({ messageId: message.id, status: 'pending' });

    const raw = await transcription.transcribeFile(filePath);
    const text = String(raw || '').trim().slice(0, 4000);
    await repos.saveVoiceTranscript({ messageId: message.id, text, status: 'done' });
    if (!text) return true;

    // Layer 1 — keyword scan on the transcript (mirrors chatService.sendMessage).
    if (scanForRisk(text)) {
      const flagged = await repos.setMessageRiskFlag(message.id);
      console.log(`[voice-screen] keyword HIGH msg=${message.id}`);
      emitToUser(conversation.specialistId, 'message:update', { message: flagged });
      emitToUser(sender.id, 'message:update', { message: flagged });
      await alerts.raiseAlert({
        patient: sender,
        source: 'chat',
        messageId: message.id,
        message: flagged,
        detail: { viaVoice: true },
      });
      return true;
    }

    // Layer 2 — LLM classifier, same pipeline as text messages (it records
    // its own dead letter on failure).
    return await risk.scanMessageAsync({ message, sender, conversation, text });
  } catch (err) {
    // Transcription (or alerting) failed: mark the note visibly unscreened
    // AND dead-letter it so the worker retries — never a silent gap.
    console.error('[voice-screen] failed:', err.message);
    await repos
      .saveVoiceTranscript({ messageId: message.id, status: 'failed' })
      .catch(() => {});
    await repos
      .upsertRiskScanFailure({ kind: 'voice', messageId: message.id, error: err.message })
      .catch((e) => console.error('[voice-screen] dead-letter write failed:', e.message));
    return false;
  }
}

module.exports = { screenVoiceMessageAsync };
