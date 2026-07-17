const express = require('express');
const bcrypt = require('bcryptjs');
const repos = require('../data/repos');
const { signToken } = require('../utils/tokens');
const { publicUser } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { emitToAdmins } = require('../realtime');
const config = require('../config');

const router = express.Router();

// POST /api/auth/register { name, email, password, role: 'patient'|'specialist', language? }
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'patient', language = 'ar' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name_required' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'email_invalid' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'password_too_short' });
  if (!['patient', 'specialist'].includes(role)) return res.status(400).json({ error: 'role_invalid' });
  if (await repos.findUserByEmail(email)) return res.status(409).json({ error: 'email_taken' });

  let user;
  try {
    user = await repos.insertUser({
      role,
      name: String(name).trim(),
      email: String(email).toLowerCase(),
      passwordHash: bcrypt.hashSync(password, 8),
      language: ['ar', 'fr'].includes(language) ? language : 'ar',
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
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? await repos.findUserByEmail(email) : null;
  if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// POST /api/auth/google { idToken } — mock mode accepts { email, name } directly.
// TODO(production): verify idToken with google-auth-library and drop mock mode.
router.post('/google', async (req, res) => {
  if (!config.mockGoogleAuth) return res.status(501).json({ error: 'google_auth_not_configured' });
  const { email, name } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'email_invalid' });

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
