-- Phase 2.5 — client-side encrypted journal.
--
-- `journal_entries.note` is the most intimate free text in the system and it
-- sat in plaintext beside everything else, readable by the server, by anyone
-- with a database credential, and by the treating specialist by default.
-- After this the patient holds the key and the server holds ciphertext.
--
-- THE SAFETY CONSTRAINT COMES FIRST. Rule 1 of the engineering plan: never
-- widen the safety gap. Today a journal note runs through two layers — an
-- instant keyword scan and an LLM classifier — and a high verdict pages the
-- specialist WITH the triggering text. Encryption must not quietly remove
-- either layer, so:
--
--   * `scan` records an ATTESTATION for every encrypted entry: which layers
--     ran, what they concluded, and a server-issued HMAC over the verdict.
--     A missing or failed attestation is dead-lettered and surfaced by
--     /api/health/safety. The failure mode is "we know this was not scanned",
--     never "we assume it was fine".
--   * On a high verdict the client attaches `crisis_envelope` — the
--     triggering excerpt sealed to the treating specialist's public key — so
--     the clinician still reads the text of an alert about a patient in
--     danger. The patient is told this before they turn the lock on.
--
-- Exactly one of note / ciphertext is ever set. Existing plaintext notes stay
-- as they are: encryption starts when the patient opts in, and nothing that
-- was already written is destroyed or rewritten.

ALTER TABLE journal_entries ALTER COLUMN note DROP NOT NULL;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS ciphertext       text;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS nonce            text;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS key_version      integer;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS enc_alg          text;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS scan             jsonb;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS crisis_envelope  jsonb;

-- A row carries plaintext, or ciphertext, or neither (a check-in with no
-- written note at all) — never both.
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_body_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_body_check
  CHECK (note IS NULL OR ciphertext IS NULL);

-- Ciphertext without an attestation is the one state that must never exist
-- silently. It is allowed at the column level (the route dead-letters it and
-- the health endpoint counts it) but it is visible in one query.
CREATE INDEX IF NOT EXISTS journal_entries_unscanned_idx
  ON journal_entries (created_at) WHERE ciphertext IS NOT NULL AND scan IS NULL;

-- --- per-entry sharing --------------------------------------------------------
-- "Sharing a single entry re-encrypts that entry to the specialist's public
-- key." Per entry, per specialist, never a blanket toggle. Revoking deletes
-- the row — the specialist keeps whatever they already read, which is true of
-- anything anyone has ever read, and the UI says so rather than pretending
-- otherwise.
CREATE TABLE IF NOT EXISTS journal_shares (
  id            text PRIMARY KEY,
  entry_id      text NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  patient_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialist_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  envelope      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, specialist_id)
);
CREATE INDEX IF NOT EXISTS journal_shares_specialist_idx
  ON journal_shares (specialist_id, created_at DESC);

-- --- key material -------------------------------------------------------------
-- public_key: the specialist's X25519 public key, published so patients can
-- seal an entry to them. Public by definition; the private half never leaves
-- the clinician's device.
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key text;

-- Recovery, designed before a line of crypto was written, because losing a
-- device must not silently destroy a year of journalling.
--
--   method 'phrase' — the journal key is wrapped under a key derived from a
--     12-word phrase the patient writes down. `wrapped_key` is useless to us.
--     Lose the phrase AND the device and the entries are gone; the setup
--     screen says exactly that, in those words.
--   method 'escrow' — wrapped under a server-held key. RESERVED, and not
--     offered by the app yet, on purpose. The cryptography is the easy half;
--     the half that does not exist is the operational one — who may ask for a
--     patient's journal to be reopened, how their identity is verified, and
--     who signs off. Shipping the option before that procedure exists would
--     let a patient choose "the clinic can recover this for me" when no clinic
--     process can. The column accepts the value so the flow can be added
--     without a migration once that policy is written.
--   method 'none' — device only. Offered, but never the default.
--
-- No default anywhere: the patient chooses before the lock turns on.
CREATE TABLE IF NOT EXISTS journal_recovery (
  user_id     text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  method      text NOT NULL CHECK (method IN ('phrase', 'escrow', 'none')),
  wrapped_key text,
  key_version integer NOT NULL DEFAULT 1,
  public_key  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (method = 'none' OR wrapped_key IS NOT NULL)
);
