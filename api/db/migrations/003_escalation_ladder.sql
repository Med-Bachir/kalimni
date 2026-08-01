-- Phase 1.1 — the escalation ladder. An open safety alert must always have a
-- human on the hook: the assigned specialist, or the on-call rota for
-- unassigned patients, re-paged at 15 min and escalated to every admin at
-- 60 min. alert_escalations is the append-only audit that every page (and
-- the acknowledging clinical action) actually happened.

-- Who answers for UNASSIGNED patients. tier 1 = first page, tier 2 = the
-- backup paged when 15 minutes pass without acknowledgement.
CREATE TABLE IF NOT EXISTS on_call_rota (
  id            text PRIMARY KEY,
  specialist_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier          integer NOT NULL DEFAULT 1 CHECK (tier IN (1, 2)),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS on_call_rota_window_idx ON on_call_rota (starts_at, ends_at);

-- Append-only audit of every page for an alert.
--   tier 0 = initial page at alert creation
--   tier 1 = 15-minute re-page (assigned target again + tier-2 rota backup)
--   tier 2 = 60-minute critical broadcast to every admin
--   method 'ack' rows record the acknowledging user's clinical action_taken.
CREATE TABLE IF NOT EXISTS alert_escalations (
  id              text PRIMARY KEY,
  alert_id        text NOT NULL REFERENCES safety_alerts(id) ON DELETE CASCADE,
  tier            integer NOT NULL CHECK (tier BETWEEN 0 AND 2),
  notified_id     text REFERENCES users(id) ON DELETE SET NULL, -- NULL = admin broadcast
  method          text NOT NULL CHECK (method IN ('page', 'repage', 'critical', 'ack')),
  action_taken    text,                                         -- ack rows only
  notified_at     timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);
CREATE INDEX IF NOT EXISTS alert_escalations_alert_idx ON alert_escalations (alert_id, tier);
CREATE INDEX IF NOT EXISTS alert_escalations_notified_idx ON alert_escalations (notified_id);

-- Dead-letter queue for LLM risk scans that failed (layer 2 of the safety
-- net). The escalation worker retries these; unresolved rows are surfaced by
-- GET /api/health/safety so a broken classifier is never silent.
CREATE TABLE IF NOT EXISTS risk_scan_failures (
  id          text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('chat', 'voice')),
  message_id  text NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  attempts    integer NOT NULL DEFAULT 1,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  retried_at  timestamptz,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS risk_scan_failures_open_idx ON risk_scan_failures (created_at) WHERE resolved_at IS NULL;
