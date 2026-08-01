const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const repos = require('../data/repos');
const { signToken } = require('../utils/tokens');
const { publicUser } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const rateLimits = require('../middleware/rateLimits');
const { validate } = require('../middleware/validate');
const schemas = require('../schemas');
const { emitToAdmins } = require('../realtime');
const config = require('../config');

const router = express.Router();

// POST /api/auth/register { name, email, password, role: 'patient'|'specialist', language? }
router.post('/register', rateLimits.auth, validate(schemas.register), async (req, res) => {
  const { name, email, password, role, language } = req.body;
  if (await repos.findUserByEmail(email)) return res.status(409).json({ error: 'email_taken' });

  let user;
  try {
    user = await repos.insertUser({
      role,
      name,
      email,
      // Cost 12, async — hashSync at cost 8 both blocked the event loop and
      // was cheap to crack offline (Phase 3.2).
      passwordHash: await bcrypt.hash(password, 12),
      language,
      ...(role === 'patient'
        ? { assignedSpecialistId: null, intakeCompletedAt: null, intakeSkipped: false }
        : { title: null, status: 'pending', specialties: [], bio: null, license: null }),
    });
  } catch (err) {
    // Unique index race: two simultaneous registrations with the same email.
    if (err.code === '23505') return res.status(409).json({ error: 'email_taken' });
    throw err;
  }

  // Admin dashboards (user list, stats, approval queue) refresh live.
  emitToAdmins('users:update', { userId: user.id, role: user.role });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// POST /api/auth/login { email, password }
router.post('/login', rateLimits.auth, validate(schemas.login), async (req, res) => {
  const { email, password } = req.body;
  const user = email ? await repos.findUserByEmail(email) : null;
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// POST /api/auth/google { idToken } — the email is ONLY ever taken from a
// verified Google ID token payload, never from the request body. The one
// exception is mock mode ({ email, name } accepted as-is), which is
// dev-only: config.js throws at boot if it is enabled in production.
const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

router.post('/google', rateLimits.auth, validate(schemas.google), async (req, res) => {
  let email;
  let name;

  if (config.mockGoogleAuth) {
    ({ email, name } = req.body);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'email_invalid' });
  } else {
    if (!googleClient) return res.status(501).json({ error: 'google_auth_not_configured' });
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') return res.status(401).json({ error: 'google_token_invalid' });
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: config.googleClientId });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'google_token_invalid' });
    }
    if (!payload?.email || payload.email_verified === false) {
      return res.status(401).json({ error: 'google_token_invalid' });
    }
    email = payload.email;
    name = payload.name;
  }

  let user = await repos.findUserByEmail(email);
  if (!user) {
    user = await repos.insertUser({
      role: 'patient', name: name || email.split('@')[0],
      email: String(email).toLowerCase(), passwordHash: '!google',
      language: 'ar',
      assignedSpecialistId: null, intakeCompletedAt: null, intakeSkipped: false,
    });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
