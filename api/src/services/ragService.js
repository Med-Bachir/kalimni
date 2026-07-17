// RAG over the internal content library. Indexing chunks each content item
// per language and stores multilingual-e5 embeddings in pgvector
// (content_embeddings); retrieval embeds the user's message and returns the
// top-k chunks from PUBLISHED content only, for injection into the companion
// prompt. The companion must never answer medical questions from anything
// but this corpus.
//
// If local embeddings are unavailable (model failed to load), retrieval
// degrades to a naive shared-token keyword score over the stored chunks —
// worse ranking, but the companion keeps working.
const { run, all } = require('../data/pg');
const repos = require('../data/repos');
const embeddings = require('./embeddingService');

const CHUNK_CHARS = 500;
const LANGS = ['ar', 'fr'];

// --- chunking ----------------------------------------------------------------

// One language slice of a content item -> plain-text chunks. Chunk 0 is always
// title + summary (the best "what is this about" signal); body paragraphs are
// packed into ~500-char chunks, splitting on sentence ends.
function chunksOf(item, lang) {
  const chunks = [`${item.title?.[lang] || ''}. ${item.summary?.[lang] || ''}`.trim()];
  const paragraphs = (item.body || [])
    .map((block) => block.text?.[lang] || '')
    .filter(Boolean);

  let current = '';
  for (const p of paragraphs) {
    for (const sentence of p.split(/(?<=[.!؟?…])\s+/)) {
      if (current && current.length + sentence.length + 1 > CHUNK_CHARS) {
        chunks.push(current.trim());
        current = '';
      }
      current += `${sentence} `;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 20);
}

// --- indexing ------------------------------------------------------------------

/** (Re)indexes one content item, or the whole library when id is omitted. */
async function indexContent(contentId) {
  const items = contentId
    ? [await repos.findContent(contentId)].filter(Boolean)
    : await repos.listContent({ includeUnpublished: true });

  let rows = 0;
  for (const item of items) {
    await run('DELETE FROM content_embeddings WHERE content_id = $1', [item.id]);
    for (const lang of LANGS) {
      const chunks = chunksOf(item, lang);
      if (!chunks.length) continue;
      const vectors = await embeddings.embedPassages(chunks);
      for (let i = 0; i < chunks.length; i++) {
        await run(
          `INSERT INTO content_embeddings (content_id, lang, chunk_index, chunk, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)
           ON CONFLICT (content_id, lang, chunk_index) DO UPDATE
             SET chunk = EXCLUDED.chunk, embedding = EXCLUDED.embedding`,
          [item.id, lang, i, chunks[i], embeddings.toSql(vectors[i])]
        );
        rows++;
      }
    }
  }
  return { items: items.length, rows };
}

/** Removes a deleted item's chunks (content FK cascades too; explicit for callers). */
const deindexContent = (contentId) =>
  run('DELETE FROM content_embeddings WHERE content_id = $1', [contentId]);

// --- retrieval -----------------------------------------------------------------

// Naive fallback when embeddings are unavailable: rank chunks by how many
// query tokens they share (case-folded, 3+ chars).
async function keywordRetrieve(query, lang, k) {
  const tokens = [...new Set(String(query).toLowerCase().split(/[\s.,;:!؟?()«»"']+/).filter((t) => t.length >= 3))];
  if (!tokens.length) return [];
  const rows = await all(
    `SELECT ce.content_id, ce.chunk, c.title, c.category, c.type
     FROM content_embeddings ce JOIN content c ON c.id = ce.content_id
     WHERE ce.lang = $1 AND c.published = true`,
    [lang]
  );
  return rows
    .map((r) => ({
      ...r,
      score: tokens.filter((tok) => r.chunk.toLowerCase().includes(tok)).length / tokens.length,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Top-k published chunks most similar to the query, with their content refs:
 * [{ contentId, chunk, score, title, category, type }]
 */
async function retrieve(query, lang = 'ar', k = 4) {
  if (!LANGS.includes(lang)) lang = 'ar';
  try {
    if (embeddings.isBroken()) throw new Error('embeddings_unavailable');
    const vector = await embeddings.embedQuery(query);
    return await all(
      `SELECT ce.content_id, ce.chunk, 1 - (ce.embedding <=> $1::vector) AS score,
              c.title, c.category, c.type
       FROM content_embeddings ce JOIN content c ON c.id = ce.content_id
       WHERE ce.lang = $2 AND c.published = true
       ORDER BY ce.embedding <=> $1::vector
       LIMIT $3`,
      [embeddings.toSql(vector), lang, k]
    );
  } catch (err) {
    console.error('[rag] vector retrieve failed, keyword fallback:', err.message);
    return keywordRetrieve(query, lang, k);
  }
}

module.exports = { indexContent, deindexContent, retrieve, chunksOf };
