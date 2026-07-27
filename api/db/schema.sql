-- Kalimni PostgreSQL schema.
-- Mirrors the shapes of the old in-memory mock DB (src/data/db.js) so the API
-- responses stay byte-identical for the client. Ids remain app-generated text
-- ("u_...", "c_...") — no serials, so nothing changes client-side.
-- Bilingual {ar, fr} values, settings, answers and article bodies are jsonb.
-- Re-runnable: drops everything first (dev only!).

DROP TABLE IF EXISTS
  content_embeddings, journal_entries, ai_state, ai_messages, ai_conversations,
  push_tokens, appointments, safety_alerts, calls, messages, conversations,
  matching_requests, questionnaire_results, content, users
CASCADE;

-- Vector similarity search for the AI companion's RAG layer (pgvector image).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
  id                      text PRIMARY KEY,
  role                    text NOT NULL CHECK (role IN ('patient', 'specialist', 'admin')),
  name                    text NOT NULL,
  email                   text NOT NULL,
  password_hash           text NOT NULL,
  language                text NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'fr')),
  settings                jsonb NOT NULL DEFAULT '{"notifications": true}',
  -- patient-only fields
  assigned_specialist_id  text REFERENCES users(id) ON DELETE SET NULL,
  intake_completed_at     timestamptz,
  intake_skipped          boolean NOT NULL DEFAULT false,
  -- specialist-only fields
  title                   text,
  status                  text CHECK (status IN ('pending', 'approved', 'rejected')),
  specialties             jsonb NOT NULL DEFAULT '[]',
  license                 text,
  bio                     text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_assigned_specialist_idx ON users (assigned_specialist_id);

CREATE TABLE conversations (
  id            text PRIMARY KEY,
  patient_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialist_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, specialist_id)
);
CREATE INDEX conversations_specialist_idx ON conversations (specialist_id);

-- sender_id is intentionally NOT a foreign key: account deletion anonymizes
-- messages by setting sender_id = 'deleted' (privacy requirement — the
-- specialist's clinical record stays coherent, personal data is removed).
CREATE TABLE messages (
  id                text PRIMARY KEY,
  conversation_id   text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         text NOT NULL,
  text              text NOT NULL DEFAULT '',  -- empty for voice messages
  audio_url         text,                       -- set for voice messages (/api/media/voice/...)
  audio_duration_ms integer,
  risk_flag         boolean NOT NULL DEFAULT false,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX messages_unread_idx ON messages (conversation_id, sender_id) WHERE read_at IS NULL;

CREATE TABLE questionnaire_results (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  questionnaire_id text NOT NULL,             -- 'gad7' | 'phq9'
  score            integer NOT NULL,
  level            text NOT NULL,             -- scoring band level
  label            jsonb NOT NULL,            -- { ar, fr }
  answers          jsonb NOT NULL,            -- int[] in item order
  crisis_flag      boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questionnaire_results_user_idx ON questionnaire_results (user_id, created_at DESC);

CREATE TABLE matching_requests (
  id                       text PRIMARY KEY,
  patient_id               text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                     text NOT NULL DEFAULT 'match' CHECK (type IN ('match', 'reassign')),
  status                   text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'review', 'accepted', 'rejected')),
  assigned_specialist_id   text REFERENCES users(id) ON DELETE SET NULL,
  requested_specialist_id  text REFERENCES users(id) ON DELETE SET NULL,
  note                     text,
  context                  jsonb,             -- { questionnaireId, score, level }
  created_at               timestamptz NOT NULL DEFAULT now(),
  decided_at               timestamptz
);
CREATE INDEX matching_requests_status_idx ON matching_requests (status);
CREATE INDEX matching_requests_patient_idx ON matching_requests (patient_id);

CREATE TABLE content (
  id           text PRIMARY KEY,
  key          text,                          -- stable key from the seed ('panic-guide')
  type         text NOT NULL CHECK (type IN ('article', 'audio', 'exercise')),
  category     text NOT NULL,                 -- anxiety | sleep | growth | exercises
  featured     boolean NOT NULL DEFAULT false,
  minutes      integer NOT NULL,
  gradient     jsonb NOT NULL DEFAULT '["#BFDCE5", "#8FBCCB"]',
  author       jsonb,                         -- { ar, fr }
  title        jsonb NOT NULL,                -- { ar, fr }
  summary      jsonb NOT NULL,                -- { ar, fr }
  body         jsonb NOT NULL DEFAULT '[]',   -- reader blocks [{type, text, ...}]
  exercise_key text,
  published    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_category_idx ON content (category);

CREATE TABLE safety_alerts (
  id              text PRIMARY KEY,
  patient_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialist_id   text REFERENCES users(id) ON DELETE SET NULL,
  message_id      text REFERENCES messages(id) ON DELETE SET NULL,
  result_id       text REFERENCES questionnaire_results(id) ON DELETE SET NULL,
  source          text NOT NULL CHECK (source IN ('chat', 'questionnaire', 'ai_chat')),
  detail          jsonb,                        -- ai_chat: { risk, trigger, aiConversationId }
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged')),
  acknowledged_by text,
  acknowledged_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safety_alerts_specialist_idx ON safety_alerts (specialist_id, status);
CREATE INDEX safety_alerts_patient_idx ON safety_alerts (patient_id, status);

CREATE TABLE calls (
  id              text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  caller_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         text NOT NULL,
  caller_uid      bigint NOT NULL,
  callee_uid      bigint NOT NULL,
  media           text NOT NULL DEFAULT 'voice' CHECK (media IN ('voice', 'video')),
  status          text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended')),
  outcome         text CHECK (outcome IN ('completed', 'rejected', 'cancelled', 'missed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  ended_at        timestamptz
);
CREATE INDEX calls_conversation_idx ON calls (conversation_id, status);

-- Session scheduling. Either party proposes a time; the other confirms or
-- declines. A lightweight alternative to a full calendar (MVP scope): one
-- proposed slot at a time, agreed inside the existing conversation.
CREATE TABLE appointments (
  id              text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  patient_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialist_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_by     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at    timestamptz NOT NULL,
  duration_min    integer NOT NULL DEFAULT 45,
  mode            text NOT NULL DEFAULT 'call' CHECK (mode IN ('call', 'chat')),
  status          text NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'confirmed', 'declined', 'cancelled', 'completed')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz
);
CREATE INDEX appointments_conversation_idx ON appointments (conversation_id, scheduled_at DESC);
CREATE INDEX appointments_patient_idx ON appointments (patient_id, scheduled_at);
CREATE INDEX appointments_specialist_idx ON appointments (specialist_id, scheduled_at);

-- Expo push tokens ("ExponentPushToken[...]"), one row per device — a user
-- can be logged in on several phones. Dead tokens are removed when Expo's
-- push API reports DeviceNotRegistered (see services/pushService.js).
CREATE TABLE push_tokens (
  token      text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);

-- --- AI support companion ----------------------------------------------------
-- One persistent AI thread per patient. status 'crisis_hold' = a HIGH risk
-- message stopped normal assistance; only crisis resources are shown until the
-- safety alert is acknowledged by a human (specialist/admin).
CREATE TABLE ai_conversations (
  id         text PRIMARY KEY,
  patient_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'crisis_hold')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- role 'crisis' marks the fixed crisis response (never LLM-generated).
-- suggestions: [{kind:'exercise'|'content', key/id, title}] attached to replies.
CREATE TABLE ai_messages (
  id              text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'crisis')),
  text            text NOT NULL,
  risk            text NOT NULL DEFAULT 'none' CHECK (risk IN ('none', 'low', 'high')),
  suggestions     jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON ai_messages (conversation_id, created_at);

-- Rolling conversation memory: a summary replaces old messages in the prompt,
-- so the LLM never receives the full history.
-- follow_up: short question re-opening the last conversation on the home
-- screen. Kept in sync with db/migrations/001_ai_follow_up.sql for live DBs.
CREATE TABLE ai_state (
  conversation_id        text PRIMARY KEY REFERENCES ai_conversations(id) ON DELETE CASCADE,
  summary                text NOT NULL DEFAULT '',
  topics                 jsonb NOT NULL DEFAULT '[]',
  emotion                text,
  follow_up              text,
  messages_since_summary integer NOT NULL DEFAULT 0,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Daily check-in (mood sliders 1-5) + optional journal note.
CREATE TABLE journal_entries (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood       integer NOT NULL CHECK (mood BETWEEN 1 AND 5),
  stress     integer NOT NULL CHECK (stress BETWEEN 1 AND 5),
  energy     integer NOT NULL CHECK (energy BETWEEN 1 AND 5),
  sleep      integer NOT NULL CHECK (sleep BETWEEN 1 AND 5),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_entries_user_idx ON journal_entries (user_id, created_at DESC);

-- RAG index over the content library. multilingual-e5-small embeddings
-- (384-dim), one row per ~500-char chunk per language. Exact cosine search —
-- no ANN index needed at library scale (hundreds of rows).
CREATE TABLE content_embeddings (
  content_id  text NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  lang        text NOT NULL CHECK (lang IN ('ar', 'fr')),
  chunk_index integer NOT NULL,
  chunk       text NOT NULL,
  embedding   vector(384) NOT NULL,
  PRIMARY KEY (content_id, lang, chunk_index)
);
