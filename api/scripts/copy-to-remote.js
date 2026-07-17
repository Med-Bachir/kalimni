// Copies ALL data from the local database to a deployed one (e.g. Render),
// using the pg driver only — no pg_dump/psql binaries needed.
//
//   node scripts/copy-to-remote.js "<TARGET_DATABASE_URL>"
//   node scripts/copy-to-remote.js "<TARGET_DATABASE_URL>" --reset
//
// SOURCE  = SOURCE_DATABASE_URL env, else DATABASE_URL from .env (your local DB).
// TARGET  = first CLI arg (the Render External Database URL).
//
// Safe by default: every row is inserted with ON CONFLICT DO NOTHING, so
// re-running is harmless and existing rows on the target are never overwritten.
// Pass --reset to DROP and recreate the target schema first (destroys all data
// on the target — only for an empty/throwaway deployed DB).
//
// Tables are copied parent-before-child so foreign keys are satisfied. Rows are
// inserted verbatim (same text ids), so relationships stay intact.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const TARGET_URL = process.argv[2];
const RESET = process.argv.includes('--reset');
const SOURCE_URL = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;

if (!TARGET_URL || TARGET_URL.startsWith('--')) {
  console.error('Usage: node scripts/copy-to-remote.js "<TARGET_DATABASE_URL>" [--reset]');
  process.exit(1);
}
if (!SOURCE_URL) {
  console.error('No source DB: set DATABASE_URL in api/.env (your local DB) or SOURCE_DATABASE_URL.');
  process.exit(1);
}

// Render (and most hosted PGs) require TLS; local Docker does not.
const sslFor = (url) =>
  /render\.com|amazonaws\.com|neon\.tech|supabase\.|\.cloud/.test(url) ? { rejectUnauthorized: false } : false;

// Parent tables first. Child tables reference ids that already exist by then.
const TABLES = [
  'users',
  'content',
  'conversations',
  'messages',
  'questionnaire_results',
  'matching_requests',
  'safety_alerts',
  'calls',
  'appointments',
  'push_tokens',
  'journal_entries',       // -> users
  'ai_conversations',      // -> users
  'ai_messages',           // -> ai_conversations
  'ai_state',              // -> ai_conversations
  'content_embeddings',    // -> content (pgvector; needs the vector extension on target)
];

// users has a self-FK (assigned_specialist_id -> users.id): insert the users
// nobody points from first (admins/specialists/unassigned), then the rest.
const ORDER = { users: 'ORDER BY assigned_specialist_id NULLS FIRST' };

async function copyTable(src, tgt, table) {
  // Skip tables the target doesn't have (e.g. push_tokens on an older schema).
  const has = await tgt.query("SELECT to_regclass($1) IS NOT NULL AS ok", [`public.${table}`]);
  if (!has.rows[0].ok) {
    console.log(`  ${table.padEnd(22)} skipped (not on target)`);
    return;
  }
  const { rows } = await src.query(`SELECT * FROM ${table} ${ORDER[table] || ''}`);
  if (!rows.length) {
    console.log(`  ${table.padEnd(22)} 0 rows`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let inserted = 0;
  for (const row of rows) {
    const values = cols.map((c) => {
      const v = row[c];
      // jsonb columns come back as JS objects/arrays — re-stringify for insert.
      // Dates (timestamptz) pass through as-is.
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
      return v;
    });
    const res = await tgt.query(sql, values);
    inserted += res.rowCount;
  }
  console.log(`  ${table.padEnd(22)} ${inserted}/${rows.length} copied${inserted < rows.length ? ' (rest already existed)' : ''}`);
}

async function main() {
  const src = new Client({ connectionString: SOURCE_URL, ssl: sslFor(SOURCE_URL) });
  const tgt = new Client({ connectionString: TARGET_URL, ssl: sslFor(TARGET_URL) });
  await src.connect();
  await tgt.connect();

  const tgtHost = new URL(TARGET_URL.replace(/^postgres(ql)?:\/\//, 'http://')).host;
  console.log(`source: local  ->  target: ${tgtHost}\n`);

  // Ensure the schema exists on the target (or reset it if asked).
  const usersExists = (await tgt.query("SELECT to_regclass('public.users') IS NOT NULL AS ok")).rows[0].ok;
  if (RESET || !usersExists) {
    console.log(RESET ? '[reset] dropping + recreating target schema...' : '[schema] target empty — creating schema...');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await tgt.query(schema);
  } else {
    console.log('[schema] target already has tables — merging (ON CONFLICT DO NOTHING).');
  }

  console.log('\ncopying:');
  const failures = [];
  for (const table of TABLES) {
    try {
      await copyTable(src, tgt, table);
    } catch (err) {
      // Keep going — a later table's failure shouldn't lose the earlier copies.
      console.log(`  ${table.padEnd(22)} ERROR: ${err.message}`);
      failures.push(table);
    }
  }
  if (failures.length) {
    console.log(`\n⚠ ${failures.length} table(s) had errors: ${failures.join(', ')}`);
    console.log('  (content_embeddings can be regenerated on the server with "npm run ai:index" — it doesn\'t have to copy.)');
  }

  await src.end();
  await tgt.end();
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[copy] failed:', err.message);
  process.exit(1);
});
