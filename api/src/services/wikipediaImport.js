// External article import — Wikipedia (free API, the only large free source
// covering BOTH app languages, Arabic + French). Used by the CLI script
// (npm run ai:import) and the admin endpoint POST /api/content/import.
//
// Safety/quality gates:
//   - Curated topic list only (our domains: anxiety, sleep, growth) — never a
//     crawl. A topic is skipped unless BOTH languages resolve (bilingual app).
//   - Inserted with published=false: an admin reviews and publishes from the
//     content CMS before patients (or the AI companion's RAG) can see it.
//   - Clear CC BY-SA attribution (author field + source block with the URLs).
// Idempotent: topics whose key already exists are skipped.
const repos = require('../data/repos');
const rag = require('./ragService');

// Wikimedia etiquette: identify the client.
const UA = 'KalimniContentImporter/1.0 (dev; contact: admin@kalimni.app)';

const GRADIENTS = {
  anxiety: ['#BFDCE5', '#8FBCCB'],
  sleep: ['#D8E8DC', '#A5C8AF'],
  growth: ['#E3DFF0', '#B3A8D6'],
};

// key -> our category + the exact Wikipedia titles per language. Adding a
// topic here is all it takes; missing/renamed pages are skipped gracefully.
const TOPICS = [
  { key: 'wiki-anxiety', category: 'anxiety', titles: { ar: 'قلق', fr: 'Anxiété' } },
  { key: 'wiki-panic-attack', category: 'anxiety', titles: { ar: 'نوبة هلع', fr: 'Attaque de panique' } },
  { key: 'wiki-social-anxiety', category: 'anxiety', titles: { ar: 'اضطراب القلق الاجتماعي', fr: 'Phobie sociale' } },
  { key: 'wiki-depression', category: 'growth', titles: { ar: 'اكتئاب', fr: 'Dépression (psychiatrie)' } },
  { key: 'wiki-stress', category: 'growth', titles: { ar: 'ضغط نفسي', fr: 'Stress' } },
  { key: 'wiki-mindfulness', category: 'growth', titles: { ar: 'وعي تام', fr: 'Pleine conscience' } },
  { key: 'wiki-cbt', category: 'growth', titles: { ar: 'علاج سلوكي معرفي', fr: 'Thérapie cognitivo-comportementale' } },
  { key: 'wiki-self-esteem', category: 'growth', titles: { ar: 'تقدير الذات', fr: 'Estime de soi' } },
  { key: 'wiki-meditation', category: 'growth', titles: { ar: 'تأمل', fr: 'Méditation' } },
  { key: 'wiki-burnout', category: 'growth', titles: { ar: 'احتراق نفسي مهني', fr: "Syndrome d'épuisement professionnel" } },
  // NOTE: sleep hygiene has no Arabic Wikipedia article — covered by our own
  // seeded sleep content instead.
  { key: 'wiki-insomnia', category: 'sleep', titles: { ar: 'أرق', fr: 'Insomnie' } },
  { key: 'wiki-sleep', category: 'sleep', titles: { ar: 'نوم', fr: 'Sommeil' } },
];

// Sections after which an article stops being patient-relevant.
const STOP_SECTIONS = [
  'مراجع', 'المراجع', 'وصلات خارجية', 'انظر أيضا', 'انظر أيضًا', 'ملاحظات', 'مصادر',
  'références', 'notes et références', 'voir aussi', 'liens externes', 'bibliographie', 'annexes', 'notes',
];

const MAX_BODY_CHARS = 4500;

async function fetchExtract(lang, title) {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
    `&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`wikipedia_http_${res.status}`);
  const page = (await res.json()).query?.pages?.[0];
  if (!page || page.missing || !page.extract) return null;
  return { title: page.title, extract: page.extract };
}

// Plain-text extract ("== Heading ==" markers) -> reader blocks, cut at the
// references/appendix sections and capped for mobile readability.
function toBlocks(extract) {
  const blocks = [];
  let used = 0;
  for (const line of extract.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading = trimmed.match(/^==+\s*(.+?)\s*==+$/);
    if (heading) {
      const name = heading[1].toLowerCase();
      if (STOP_SECTIONS.some((s) => name === s || name.startsWith(s))) break;
      blocks.push({ type: 'h', text: heading[1] });
      continue;
    }
    blocks.push({ type: 'p', text: trimmed });
    used += trimmed.length;
    if (used > MAX_BODY_CHARS) break;
  }
  // Drop a trailing heading with no paragraph under it.
  while (blocks.length && blocks[blocks.length - 1].type === 'h') blocks.pop();
  return blocks;
}

// Merge the two monolingual block lists into the app's bilingual shape. The
// structures rarely align 1:1, so pair by position per type — good enough for
// a reader that renders each language independently.
function mergeBlocks(arBlocks, frBlocks) {
  const merged = [];
  const max = Math.max(arBlocks.length, frBlocks.length);
  for (let i = 0; i < max; i++) {
    const ar = arBlocks[i];
    const fr = frBlocks[i];
    merged.push({
      type: (ar || fr).type,
      text: { ar: ar?.text || '', fr: fr?.text || '' },
    });
  }
  return merged;
}

const firstParagraph = (blocks) => blocks.find((b) => b.type === 'p')?.text || '';

async function importTopic(topic) {
  const [ar, fr] = await Promise.all([
    fetchExtract('ar', topic.titles.ar),
    fetchExtract('fr', topic.titles.fr),
  ]);
  if (!ar || !fr) return { skipped: `missing ${!ar ? 'ar' : 'fr'} page` };
  const arBlocks = toBlocks(ar.extract);
  const frBlocks = toBlocks(fr.extract);
  if (!arBlocks.length || !frBlocks.length) return { skipped: 'empty extract' };

  const body = mergeBlocks(arBlocks, frBlocks);
  // Source attribution (license requirement + patient transparency).
  body.push({
    type: 'p',
    text: {
      ar: `المصدر: ويكيبيديا — "${ar.title}" (رخصة CC BY-SA 4.0). محتوى تثقيفي عام وليس نصيحة طبية.`,
      fr: `Source : Wikipédia — « ${fr.title} » (licence CC BY-SA 4.0). Contenu éducatif général, pas un avis médical.`,
    },
  });

  const words = body.reduce((n, b) => n + (b.text.ar.split(/\s+/).length + b.text.fr.split(/\s+/).length) / 2, 0);
  const item = await repos.insertContent({
    key: topic.key,
    type: 'article',
    category: topic.category,
    minutes: Math.max(3, Math.round(words / 180)),
    gradient: GRADIENTS[topic.category],
    author: { ar: 'ويكيبيديا (CC BY-SA 4.0)', fr: 'Wikipédia (CC BY-SA 4.0)' },
    title: { ar: ar.title, fr: fr.title },
    summary: {
      ar: firstParagraph(body.slice(0, -1)).ar.slice(0, 180),
      fr: firstParagraph(body.slice(0, -1)).fr.slice(0, 180),
    },
    body,
    published: false, // admin reviews, then publishes from the CMS
  });
  await rag.indexContent(item.id); // indexed now, retrievable once published
  return { item };
}

/**
 * Imports every curated topic not already in the library.
 * Returns { imported: [{key, title}], skipped: [{key, reason}], failed: [{key, error}] }
 */
async function importTopics() {
  const existing = await repos.listContent({ includeUnpublished: true });
  const existingKeys = new Set(existing.map((i) => i.key));
  const summary = { imported: [], skipped: [], failed: [] };

  for (const topic of TOPICS) {
    if (existingKeys.has(topic.key)) {
      summary.skipped.push({ key: topic.key, reason: 'already imported' });
      continue;
    }
    try {
      const result = await importTopic(topic);
      if (result.skipped) {
        summary.skipped.push({ key: topic.key, reason: result.skipped });
        console.warn(`[import] ${topic.key}: ${result.skipped} — skipped`);
      } else {
        summary.imported.push({ key: topic.key, title: result.item.title });
        console.log(`[import] ${topic.key}: OK — "${result.item.title.ar}" (unpublished)`);
      }
    } catch (err) {
      summary.failed.push({ key: topic.key, error: err.message });
      console.error(`[import] ${topic.key}: failed — ${err.message}`);
    }
  }
  return summary;
}

module.exports = { importTopics, TOPICS };
