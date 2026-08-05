-- Phase 2.3 — Session Witness.
--
-- The companion accumulates real clinical signal in ai_state and it is
-- invisible to the treating specialist: a silo in the middle of a treatment
-- relationship. A brief closes it — but only ever with the patient as author.
--
-- The consent model is the whole design:
--   * `items` on a DRAFT holds every candidate the server assembled, visible
--     to the patient alone.
--   * Sharing REWRITES `items` to the consented subset. The unshared ones are
--     deleted, not flagged — "remove anything you don't want shared" has to
--     mean removed, including from anyone who later reads this table.
--   * A shared brief is frozen. Later edits to the companion's memory do not
--     retract it, because you cannot unsend something a clinician has read.
--
-- One safety carve-out, marked `locked` on the item: safety alerts are ALREADY
-- visible to the specialist through their own route. They appear in the brief
-- so the patient's picture of what their clinician knows is accurate, and they
-- cannot be toggled off — an un-tickable checkbox would be a lie, and a
-- tickable one would be a way to suppress an alert. Rule 1: never widen the
-- safety gap.
CREATE TABLE IF NOT EXISTS session_briefs (
  id             text PRIMARY KEY,
  patient_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialist_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id text REFERENCES appointments(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'shared')),
  items          jsonb NOT NULL DEFAULT '[]',
  takeaway       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  shared_at      timestamptz,
  takeaway_at    timestamptz
);

CREATE INDEX IF NOT EXISTS session_briefs_patient_idx
  ON session_briefs (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS session_briefs_specialist_idx
  ON session_briefs (specialist_id, shared_at DESC) WHERE status = 'shared';

-- One open draft per patient: "your next brief" is a single thing on the
-- screen, and the uniqueness is what lets the client fetch it without an id.
CREATE UNIQUE INDEX IF NOT EXISTS session_briefs_one_draft_idx
  ON session_briefs (patient_id) WHERE status = 'draft';
