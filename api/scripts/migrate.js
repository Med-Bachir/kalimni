// Applies db/migrations/*.sql in filename order, once each.
//   npm run db:migrate
//
// Exists because db/schema.sql DROPs every table — it can only ever run against
// a dev database. Once an environment has real data (production), schema changes
// have to arrive as additive migrations instead.
//
// Each file runs inside a transaction and is recorded in schema_migrations, so
// re-running is a no-op. Write migrations idempotently anyway (IF NOT EXISTS)
// so a fresh db:setup, which already builds the current schema, stays
// compatible with a later db:migrate.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/data/pg');

const DIR = path.join(__dirname, '..', 'db', 'migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];
  if (!files.length) {
    console.log('[db:migrate] no migrations found');
    await pool.end();
    return;
  }

  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[db:migrate] skip    ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[db:migrate] applied ${file}`);
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  console.log(`[db:migrate] done — ${ran} applied, ${files.length - ran} already present`);
  await pool.end();
}

main().catch((err) => {
  console.error('[db:migrate] failed:', err.message);
  process.exit(1);
});
