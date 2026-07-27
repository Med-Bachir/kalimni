-- Open-loop follow-up question for the home screen, produced by the existing
-- rolling-summary pass (no extra LLM call). Nullable: every existing thread
-- simply has none until its next summary refresh.
ALTER TABLE ai_state ADD COLUMN IF NOT EXISTS follow_up text;
