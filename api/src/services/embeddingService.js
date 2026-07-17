// Local text embeddings for the RAG layer — no external API, no key, works
// offline. Uses multilingual-e5-small (384-dim, strong Arabic/French) via
// transformers.js; the ~100MB ONNX model downloads once into api/.hf-cache
// on first use, then loads from disk.
//
// E5 convention: search queries are prefixed "query: ", indexed documents
// "passage: " — skipping the prefixes measurably hurts retrieval quality.
//
// If the model can't load (no network on first run, unsupported CPU), the
// service reports unavailable and ragService falls back to keyword scoring —
// the companion never breaks because of embeddings.
const path = require('path');

const MODEL = 'Xenova/multilingual-e5-small';
const DIM = 384;

let pipelinePromise = null; // lazy singleton
let failed = false;

async function loadPipeline() {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = path.join(__dirname, '..', '..', '.hf-cache');
  return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
}

function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = loadPipeline().catch((err) => {
      failed = true;
      console.error('[embed] model load failed — RAG falls back to keywords:', err.message);
      throw err;
    });
  }
  return pipelinePromise;
}

/** Embeds texts; kind is 'query' or 'passage' (E5 prefixes). Returns float[][]. */
async function embed(texts, kind = 'passage') {
  const extractor = await getPipeline();
  const prefixed = texts.map((t) => `${kind}: ${String(t).replace(/\s+/g, ' ').trim()}`);
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  return output.tolist();
}

const embedQuery = async (text) => (await embed([text], 'query'))[0];
const embedPassages = (texts) => embed(texts, 'passage');

/** True once a load attempt has definitively failed (callers should fall back). */
const isBroken = () => failed;

/** Formats a JS vector as a pgvector literal for $n::vector parameters. */
const toSql = (vec) => `[${vec.map((v) => Number(v).toFixed(6)).join(',')}]`;

module.exports = { embedQuery, embedPassages, isBroken, toSql, DIM, MODEL };
