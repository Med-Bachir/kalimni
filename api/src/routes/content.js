const express = require('express');
const repos = require('../data/repos');
const rag = require('../services/ragService');
const { requireAuth, requireRole } = require('../middleware/auth');

// Keep the RAG index in sync with CMS edits. Fire-and-forget: a failed embed
// never breaks the admin flow (npm run ai:index rebuilds everything anyway).
const reindexAsync = (id) =>
  rag.indexContent(id).catch((err) => console.error('[content] reindex failed:', err.message));

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['anxiety', 'sleep', 'growth', 'exercises'];

// GET /api/content?category=&type=&q=
router.get('/', async (req, res) => {
  const { category, type, q } = req.query;
  const items = await repos.listContent({
    category, type, q,
    includeUnpublished: req.user.role === 'admin',
  });
  res.json({ items, categories: CATEGORIES });
});

router.get('/:id', async (req, res) => {
  const item = await repos.findContent(req.params.id);
  if (!item || (!item.published && req.user.role !== 'admin')) {
    return res.status(404).json({ error: 'content_not_found' });
  }
  res.json({ item });
});

// --- Admin CMS -------------------------------------------------------------
const validateItem = (body) => {
  const { type, category, minutes, title, summary } = body || {};
  if (!['article', 'audio', 'exercise'].includes(type)) return 'type_invalid';
  if (!CATEGORIES.includes(category)) return 'category_invalid';
  if (!Number.isInteger(minutes) || minutes <= 0) return 'minutes_invalid';
  if (!title?.ar || !title?.fr) return 'title_required';
  if (!summary?.ar || !summary?.fr) return 'summary_required';
  return null;
};

// POST /api/content/import — pull new curated articles from Wikipedia (free
// external API, Arabic + French). They arrive unpublished for admin review.
router.post('/import', requireRole('admin'), async (req, res) => {
  try {
    const summary = await require('../services/wikipediaImport').importTopics();
    res.json(summary);
  } catch (err) {
    console.error('[content] import failed:', err.message);
    res.status(502).json({ error: 'import_failed' });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  const error = validateItem(req.body);
  if (error) return res.status(400).json({ error });
  const { type, category, minutes, title, summary, body = [], author, gradient, featured, exerciseKey } = req.body;
  const item = await repos.insertContent({
    type, category, minutes, title, summary, body,
    author, gradient, featured: !!featured, exerciseKey: exerciseKey || null,
    published: true,
  });
  reindexAsync(item.id);
  res.status(201).json({ item });
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const existing = await repos.findContent(req.params.id);
  if (!existing) return res.status(404).json({ error: 'content_not_found' });
  const editable = ['type', 'category', 'minutes', 'title', 'summary', 'body', 'author', 'gradient', 'featured', 'published', 'exerciseKey'];
  const patch = {};
  editable.forEach((key) => {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  });
  const item = await repos.updateContent(req.params.id, patch);
  reindexAsync(item.id);
  res.json({ item });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const deleted = await repos.deleteContent(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'content_not_found' });
  res.json({ deleted: true });
});

module.exports = router;
