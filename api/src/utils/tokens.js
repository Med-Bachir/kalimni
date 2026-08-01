const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.tokenTtl });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
};

// --- short-lived signed media URLs --------------------------------------------
// For audio players that cannot set an Authorization header. The signature
// binds file + user + expiry, so the query string carries a 60-second grant
// for ONE file to ONE user — never the account credential (query strings end
// up in proxy/CDN access logs). The media route still re-checks membership
// and user existence at request time, so revocation and deletion hold.
const MEDIA_URL_TTL_S = 60;

const mediaSig = (file, userId, exp) =>
  crypto
    .createHmac('sha256', `media:${config.jwtSecret}`)
    .update(`${file}\n${userId}\n${exp}`)
    .digest('base64url');

const signMediaUrl = (file, userId) => {
  const exp = Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_S;
  return `/api/media/voice/${encodeURIComponent(file)}?uid=${encodeURIComponent(userId)}&exp=${exp}&sig=${mediaSig(file, userId, exp)}`;
};

const verifyMediaSig = (file, userId, exp, sig) => {
  if (!file || !userId || !exp || !sig) return false;
  if (!/^\d+$/.test(String(exp)) || Number(exp) * 1000 < Date.now()) return false;
  const expected = Buffer.from(mediaSig(file, String(userId), Number(exp)));
  const given = Buffer.from(String(sig));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

module.exports = { signToken, verifyToken, signMediaUrl, verifyMediaSig };
