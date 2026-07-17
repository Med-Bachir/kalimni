const repos = require('../data/repos');
const { verifyToken } = require('../utils/tokens');

// Express 5 forwards rejected promises from async middleware/handlers to the
// error handler automatically — no wrapper needed.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  const user = payload ? await repos.findUserById(payload.sub) : null;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
  next();
};

// Specialists can register freely but must be approved by an admin before
// they can access patients or conversations.
function requireApprovedSpecialist(req, res, next) {
  if (req.user.role !== 'specialist' || req.user.status !== 'approved') {
    return res.status(403).json({ error: 'specialist_not_approved' });
  }
  next();
}

module.exports = { requireAuth, requireRole, requireApprovedSpecialist };
