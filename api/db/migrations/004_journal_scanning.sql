-- Phase 1.4 — journal notes join the safety net. The daily check-in's free
-- text was stored with zero screening; it now runs through the same keyword +
-- LLM layers as chat, raising alerts with source 'journal', with failed LLM
-- scans dead-lettered against the journal entry.

-- safety_alerts.source gains 'journal'.
ALTER TABLE safety_alerts DROP CONSTRAINT IF EXISTS safety_alerts_source_check;
ALTER TABLE safety_alerts ADD CONSTRAINT safety_alerts_source_check
  CHECK (source IN ('chat', 'questionnaire', 'ai_chat', 'journal'));

-- Dead letters can now reference a journal entry instead of a message:
-- exactly one of the two references is set.
ALTER TABLE risk_scan_failures ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE risk_scan_failures
  ADD COLUMN IF NOT EXISTS journal_entry_id text UNIQUE REFERENCES journal_entries(id) ON DELETE CASCADE;
ALTER TABLE risk_scan_failures DROP CONSTRAINT IF EXISTS risk_scan_failures_kind_check;
ALTER TABLE risk_scan_failures ADD CONSTRAINT risk_scan_failures_kind_check
  CHECK (kind IN ('chat', 'voice', 'journal'));
ALTER TABLE risk_scan_failures DROP CONSTRAINT IF EXISTS risk_scan_failures_ref_check;
ALTER TABLE risk_scan_failures ADD CONSTRAINT risk_scan_failures_ref_check
  CHECK ((message_id IS NULL) <> (journal_entry_id IS NULL));
