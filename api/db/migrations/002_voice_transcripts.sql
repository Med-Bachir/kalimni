-- Voice-note transcripts: the safety net's view of audio messages. Voice
-- carries no text, so both risk layers were blind to it — on upload the audio
-- is transcribed and the transcript runs through the same keyword + LLM scan
-- as typed text (services/voiceScreeningService.js).
--
-- Deliberately a separate table rather than a messages column: message rows
-- are serialized to BOTH parties (REST + socket), and the transcript is for
-- the specialist only — machine output must never be shown back to the
-- patient as if it were their words. Out of `messages`, no default query can
-- leak it.
CREATE TABLE IF NOT EXISTS voice_transcripts (
  message_id text PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  text       text,
  status     text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'done', 'failed', 'unavailable')),
  created_at timestamptz NOT NULL DEFAULT now()
);
