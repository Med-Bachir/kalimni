// (Re)builds the RAG index: embeds every content item (published or not) into
// content_embeddings. Run after seeding, importing, or editing content:
//   npm run ai:index
// First run downloads the ~100MB embedding model into api/.hf-cache.
const rag = require('../src/services/ragService');
const { pool } = require('../src/data/pg');

(async () => {
  console.log('[ai:index] embedding content library (first run downloads the model)...');
  const t0 = Date.now();
  const { items, rows } = await rag.indexContent();
  console.log(`[ai:index] done — ${items} items, ${rows} chunks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await pool.end();
})().catch((err) => {
  console.error('[ai:index] failed:', err);
  process.exit(1);
});
