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

// --- signed risk verdicts (Phase 2.5) -----------------------------------------
// When the journal is encrypted the server can no longer scan what it stores,
// so the verdict travels with the entry instead. Unsigned, that verdict is a
// field a modified client sets to "safe"; signed, the client can only OMIT it,
// and an omission is dead-lettered and shows up in /api/health/safety.
//
// The signature binds the verdict to a HASH OF THE SCANNED TEXT, so one
// "safe" token cannot be minted once and reused for every later entry, and to
// the user, so it cannot be passed between accounts.
//
// What this does NOT do, stated plainly because the alternative is
// overclaiming: it cannot prove the ciphertext holds the text that was
// scanned. Nothing can — the client owns the key. The achievable property is
// that an unscanned entry is *visibly* unscanned, which is the same principle
// as the Phase 1 dead letters.
const SCAN_TOKEN_TTL_S = 600;

const scanSig = (verdict, textHash, userId, exp) =>
  crypto
    .createHmac('sha256', `scan:${config.jwtSecret}`)
    .update(`${verdict}\n${textHash}\n${userId}\n${exp}`)
    .digest('base64url');

const signScanVerdict = ({ verdict, textHash, userId }) => {
  const exp = Math.floor(Date.now() / 1000) + SCAN_TOKEN_TTL_S;
  return { verdict, textHash, exp, sig: scanSig(verdict, textHash, userId, exp) };
};

const verifyScanVerdict = (token, userId) => {
  if (!token || !token.verdict || !token.textHash || !token.exp || !token.sig) return false;
  if (!/^\d+$/.test(String(token.exp)) || Number(token.exp) * 1000 < Date.now()) return false;
  const expected = Buffer.from(scanSig(token.verdict, token.textHash, String(userId), Number(token.exp)));
  const given = Buffer.from(String(token.sig));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

const hashText = (text) => crypto.createHash('sha256').update(String(text)).digest('base64url');

module.exports = {
  signToken, verifyToken, signMediaUrl, verifyMediaSig,
  signScanVerdict, verifyScanVerdict, hashText,
};
