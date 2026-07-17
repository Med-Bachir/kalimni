// PostgreSQL access layer: connection pool + the small helpers shared by all
// repositories (repos.js). Every row leaves this module camelCased with
// timestamptz values serialized to ISO strings, so route/service code — and
// the JSON the client receives — looks exactly like the old in-memory objects.
const { Pool } = require('pg');
const config = require('../config');

let seq = 0;
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${(++seq).toString(36)}`;

// Hosted Postgres (Render, Neon, Supabase, RDS...) requires TLS; local Docker
// does not. Rule: use SSL for any non-local host — this also covers Render's
// INTERNAL hostname ("dpg-xxxx-a"), which has no giveaway domain. Override with
// PGSSL=true/false. rejectUnauthorized is false because Render's cert chain
// isn't in Node's default trust store (the connection is still encrypted).
function databaseNeedsSsl(url) {
  if (process.env.PGSSL === 'true') return true;
  if (process.env.PGSSL === 'false') return false;
  try {
    const host = new URL(url.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
    return !['localhost', '127.0.0.1', '::1', ''].includes(host);
  } catch {
    return false;
  }
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: databaseNeedsSsl(config.databaseUrl) ? { rejectUnauthorized: false } : false,
});

const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const camelizeRow = (row) => {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[toCamel(key)] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
};

// jsonb params must be pre-stringified: node-postgres renders plain JS arrays
// as Postgres array literals ('{a,b}'), which jsonb columns reject.
const j = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

const all = async (text, params) => (await pool.query(text, params)).rows.map(camelizeRow);
const one = async (text, params) => camelizeRow((await pool.query(text, params)).rows[0] || null);
const run = (text, params) => pool.query(text, params);

// Runs fn(client) inside a transaction on a dedicated connection.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, uid, j, all, one, run, tx, camelizeRow };
