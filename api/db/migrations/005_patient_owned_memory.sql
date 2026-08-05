-- Phase 2.4 — the companion's memory becomes patient-owned.
--
-- `ai_state.summary` is an LLM-authored précis about a psychiatric patient,
-- regenerated every 8 exchanges from their own transcript, which the patient
-- could not see, correct, or delete. Law 18-07's access-and-rectification
-- right covers it. Two columns make it theirs:
--
--   edited_at  — set when the PATIENT last rewrote or pruned the memory. The
--                summariser is told to preserve their wording from then on.
--   forgotten  — token bags of lines the patient asked the companion to
--                forget. Every regenerated summary is filtered through this
--                list before it is stored, so "forget this" survives the next
--                refresh instead of being silently re-derived.
--
-- `forgotten` stores NORMALISED TOKEN ARRAYS, never the sentence: enforcing
-- "never say this again" requires keeping something, and a stop-worded bag of
-- words is the least we can keep and still match. It is capped and never sent
-- to the LLM (services/memoryService.js).

ALTER TABLE ai_state ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE ai_state ADD COLUMN IF NOT EXISTS forgotten jsonb NOT NULL DEFAULT '[]';
