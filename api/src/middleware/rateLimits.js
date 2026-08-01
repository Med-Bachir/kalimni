// Rate limiting (Phase 3.2). In-memory stores — right for a single-node
// deployment; swap in a shared store (rate-limit-redis) if the API is ever
// load-balanced. Authenticated routes key by user id (stable across NAT and
// mobile network hops); credential/media routes key by IP (no user yet).
// index.js sets `trust proxy` so req.ip is the real client behind Render.
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
};

const byUser = (req) => req.user?.id || ipKeyGenerator(req.ip);

// Credential endpoints: brute-force protection. 20 attempts / 15 min / IP.
const auth = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 20 });

// Therapist-chat text messages: 60 / min / user.
const messages = rateLimit({ ...base, windowMs: 60_000, limit: 60, keyGenerator: byUser });

// Voice-note uploads (disk writes + transcription work): 20 / min / user.
const voice = rateLimit({ ...base, windowMs: 60_000, limit: 20, keyGenerator: byUser });

// Voice-note playback + signed-URL minting: 120 / min / IP (covers players
// re-requesting ranges).
const media = rateLimit({ ...base, windowMs: 60_000, limit: 120 });

// AI companion chat: 20 / 5 min / user — replaces the unbounded in-memory
// Map that used to live in routes/ai.js.
const aiChat = rateLimit({ ...base, windowMs: 5 * 60_000, limit: 20, keyGenerator: byUser, message: { error: 'ai_rate_limited' } });

module.exports = { auth, messages, voice, media, aiChat };
