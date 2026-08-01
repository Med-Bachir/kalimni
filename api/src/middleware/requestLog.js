// Request-id correlation logging (Phase 3.2). Every request gets an id that
// is returned in `x-request-id` and printed with method, path, status,
// duration and the acting user — enough to correlate a client report or a
// safety-alert timeline with server logs. PHI never appears here: paths and
// ids only, no bodies, no query strings.
const crypto = require('crypto');

const SKIP = /^\/api\/health/;

function requestLog(req, res, next) {
  if (SKIP.test(req.path)) return next();
  req.id = crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const user = req.user ? ` u=${req.user.id}` : '';
    console.log(`[req] ${req.id.slice(0, 8)} ${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms${user}`);
  });
  return next();
}

module.exports = { requestLog };
