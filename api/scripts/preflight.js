// Boot-time environment validation, run by `npm start` before the server.
//   node scripts/preflight.js
//
// Hard failures (missing/weak secrets, dev bypasses in production) live in
// src/config.js and stop the process here with the full list of problems.
// Below that, warnings flag configuration that is legal but weakens the
// safety net, so an operator sees the gap at deploy time instead of
// discovering it during an incident.
let config;
try {
  config = require('../src/config');
} catch (err) {
  console.error(`[preflight] ${err.message}`);
  process.exit(1);
}

const warnings = [];

if (!config.aiApiKey) {
  warnings.push(
    'AI_API_KEY is empty — the LLM risk classifier (safety layer 2) is OFF. ' +
    'Only the keyword scan protects patients; Arabizi/indirect phrasing will be missed.'
  );
}
if (!config.transcribeBaseUrl || !config.transcribeApiKey) {
  warnings.push(
    'Voice transcription is not configured (TRANSCRIBE_BASE_URL / TRANSCRIBE_API_KEY) — ' +
    'voice messages are NOT risk-screened. Specialists see them marked as unmonitored.'
  );
}
if (config.mockGoogleAuth) {
  warnings.push('MOCK_GOOGLE_AUTH=true — Google sign-in accepts unverified emails (development only).');
}
if (!config.mockGoogleAuth && !config.googleClientId) {
  warnings.push('GOOGLE_CLIENT_ID is empty — POST /api/auth/google will answer 501 (email/password still works).');
}
if (!config.agoraAppId) {
  warnings.push('AGORA_APP_ID is empty — voice/video calls are disabled (signaling still works).');
}
if (process.env.NODE_ENV === 'production' && !config.corsOrigins.length) {
  warnings.push('CORS_ORIGINS is empty — any browser origin can call the API (native apps unaffected).');
}

warnings.forEach((w) => console.warn(`[preflight] WARN: ${w}`));
console.log(`[preflight] environment OK${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`);
