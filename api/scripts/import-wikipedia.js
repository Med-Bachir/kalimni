// CLI wrapper for the Wikipedia content import:   npm run ai:import
// The actual logic lives in src/services/wikipediaImport.js and is shared
// with the admin endpoint POST /api/content/import.
const { importTopics } = require('../src/services/wikipediaImport');
const { pool } = require('../src/data/pg');

(async () => {
  const { imported, skipped, failed } = await importTopics();
  console.log(
    `[import] done — ${imported.length} new, ${skipped.length} skipped, ${failed.length} failed` +
    (imported.length ? ' (pending admin review)' : '')
  );
  await pool.end();
})().catch((err) => {
  console.error('[import] fatal:', err);
  process.exit(1);
});
