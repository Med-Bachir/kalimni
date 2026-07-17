// RETIRED: the in-memory mock DB was replaced by PostgreSQL (July 2026).
// Data access now lives in ./repos.js (queries) on top of ./pg.js (pool).
// This stub throws so any stale `require('../data/db')` fails at boot
// instead of silently reading empty arrays.
throw new Error(
  'src/data/db.js is retired — use src/data/repos.js (PostgreSQL) instead.'
);
