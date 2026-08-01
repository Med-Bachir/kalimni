// Runs before every test file. src/config.js reads .env via dotenv, and dotenv
// FILLS any variable absent from process.env — so every variable that matters
// to a test is set explicitly here (dotenv never overrides existing values,
// empty string included). This keeps tests deterministic on machines whose
// .env carries real keys.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 't'.repeat(48);
// Never queried: every DB access in unit tests goes through the fake repos.
process.env.DATABASE_URL = 'postgres://unused:unused@localhost:1/unused';
process.env.TOKEN_TTL = '1h';
process.env.MOCK_GOOGLE_AUTH = 'false';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.AGORA_APP_ID = '';
process.env.AGORA_APP_CERTIFICATE = '';
// LLM layer off: the safety tests exercise the keyword layer and the
// hold/alert logic, not a live model.
process.env.AI_API_KEY = '';
process.env.AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
process.env.AI_MODEL = 'test-model';
process.env.TRANSCRIBE_BASE_URL = '';
process.env.TRANSCRIBE_API_KEY = '';
process.env.TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';
