require('dotenv').config();

// Fail-closed configuration. This API holds clinical data: a missing secret or
// a dev bypass left on in production must stop the boot, never fall back to a
// value anyone with repo access can read. Problems are collected so the boot
// error (and scripts/preflight.js) reports everything at once.
const problems = [];

const jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  problems.push(
    'JWT_SECRET must be set to a random secret of at least 32 characters. Generate one with:\n' +
    '      node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

if (!process.env.DATABASE_URL) {
  problems.push(
    'DATABASE_URL must be set (dev: postgres://kalimni:kalimni@localhost:5433/kalimni, started with `docker compose up -d`)'
  );
}

// Dev-only bypass: POST /api/auth/google accepts a bare { email } without any
// verification. Off unless explicitly enabled, and never in production.
const mockGoogleAuth = process.env.MOCK_GOOGLE_AUTH === 'true';
if (process.env.NODE_ENV === 'production' && mockGoogleAuth) {
  problems.push('MOCK_GOOGLE_AUTH=true is a development-only authentication bypass and must not be set in production');
}

// In production the LLM risk classifier (safety layer 2) is part of the
// product's clinical safety net — running without it is a deliberate,
// explicit decision, never a forgotten env var (Phase 1.2).
if (process.env.NODE_ENV === 'production' && !process.env.AI_API_KEY && process.env.ALLOW_NO_LLM_SAFETY !== 'true') {
  problems.push(
    'AI_API_KEY is empty: the LLM risk classifier (safety layer 2) would be OFF in production. ' +
    'Set the key, or set ALLOW_NO_LLM_SAFETY=true to accept keyword-only screening explicitly.'
  );
}

if (problems.length) {
  throw new Error(`Refusing to start — fix the environment first:\n  - ${problems.join('\n  - ')}`);
}

const aiBaseUrl = process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';

module.exports = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret,
  tokenTtl: process.env.TOKEN_TTL || '30d',
  mockGoogleAuth,
  // OAuth client id the Google ID tokens must be minted for (audience check).
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Browser origins allowed by CORS (HTTP + Socket.IO). Comma-separated.
  // Empty = permissive — fine for the native app (no Origin header), warned
  // about in production by preflight.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  agoraAppId: process.env.AGORA_APP_ID || '',
  agoraAppCertificate: process.env.AGORA_APP_CERTIFICATE || '',
  databaseUrl: process.env.DATABASE_URL,

  // AI risk classifier (any OpenAI-compatible endpoint: Gemini, Groq, Ollama...).
  // Leave AI_API_KEY empty to disable the LLM layer — keyword scan still runs.
  aiBaseUrl,
  aiModel: process.env.AI_MODEL || 'gemini-2.5-flash',
  aiApiKey: process.env.AI_API_KEY || '',

  // Voice-note transcription (safety screening of audio messages). Any
  // OpenAI-compatible /audio/transcriptions endpoint. When unset, providers
  // known to host Whisper reuse the AI endpoint + key, so screening is on by
  // default wherever the configuration supports it.
  transcribeBaseUrl:
    process.env.TRANSCRIBE_BASE_URL ||
    (/api\.groq\.com|api\.openai\.com/.test(aiBaseUrl) ? aiBaseUrl : ''),
  transcribeModel: process.env.TRANSCRIBE_MODEL || 'whisper-large-v3-turbo',
  transcribeApiKey: process.env.TRANSCRIBE_API_KEY || process.env.AI_API_KEY || '',
};
