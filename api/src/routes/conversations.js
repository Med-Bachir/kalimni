const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const repos = require('../data/repos');
const { userCard } = require('../utils/serialize');
const { requireAuth } = require('../middleware/auth');
const { onlineUserIds } = require('../realtime');
const { VOICE_DIR, deleteVoiceFile } = require('../utils/mediaStore');
const chat = require('../services/chatService');

const MAX_VOICE_MS = 120_000; // 2 minutes

// Voice-message upload: audio only, 5MB cap, random server-side filename.
const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: VOICE_DIR,
    filename: (_req, _file, cb) =>
      cb(null, `vm_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}.m4a`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^audio\//i.test(file.mimetype)),
});

const router = express.Router();
router.use(requireAuth);

const serializeConversation = async (conv, viewerId) => {
  const partnerId = chat.partnerOf(conv, viewerId);
  const [partner, lastMessage, unreadCount] = await Promise.all([
    repos.findUserById(partnerId),
    repos.lastMessageOf(conv.id),
    repos.unreadCountFor(conv.id, viewerId),
  ]);
  return {
    id: conv.id,
    patientId: conv.patientId,
    specialistId: conv.specialistId,
    partner: userCard(partner, onlineUserIds),
    lastMessage,
    unreadCount,
    createdAt: conv.createdAt,
  };
};

// GET /api/conversations — the viewer's conversations, most recent first.
router.get('/', async (req, res) => {
  const convs = await repos.listConversationsOf(req.user.id);
  const list = await Promise.all(convs.map((c) => serializeConversation(c, req.user.id)));
  list.sort((a, b) =>
    (b.lastMessage?.createdAt || b.createdAt).localeCompare(a.lastMessage?.createdAt || a.createdAt)
  );
  res.json({ conversations: list });
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', async (req, res) => {
  const conv = await chat.findConversation(req.params.id);
  if (!conv || !chat.isMember(conv, req.user.id)) {
    return res.status(404).json({ error: 'conversation_not_found' });
  }
  res.json({
    conversation: await serializeConversation(conv, req.user.id),
    messages: await chat.messagesOf(conv.id),
  });
});

// POST /api/conversations/:id/messages { text }
router.post('/:id/messages', async (req, res) => {
  const conv = await chat.findConversation(req.params.id);
  if (!conv || !chat.isMember(conv, req.user.id)) {
    return res.status(404).json({ error: 'conversation_not_found' });
  }
  if (req.user.role === 'specialist' && req.user.status !== 'approved') {
    return res.status(403).json({ error: 'specialist_not_approved' });
  }
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });
  if (text.length > 4000) return res.status(400).json({ error: 'text_too_long' });

  const message = await chat.sendMessage({ conversation: conv, sender: req.user, text });
  res.status(201).json({ message });
});

// POST /api/conversations/:id/voice — multipart: 'audio' file + durationMs.
// Same guards as the text route; the safety scan is skipped (no text).
router.post('/:id/voice', voiceUpload.single('audio'), async (req, res) => {
  const cleanup = () => req.file && deleteVoiceFile(req.file.filename);
  const conv = await chat.findConversation(req.params.id);
  if (!conv || !chat.isMember(conv, req.user.id)) {
    cleanup();
    return res.status(404).json({ error: 'conversation_not_found' });
  }
  if (req.user.role === 'specialist' && req.user.status !== 'approved') {
    cleanup();
    return res.status(403).json({ error: 'specialist_not_approved' });
  }
  if (!req.file) return res.status(400).json({ error: 'audio_required' });

  const durationMs = Math.min(
    Math.max(parseInt((req.body || {}).durationMs, 10) || 0, 0),
    MAX_VOICE_MS
  );

  const message = await chat.sendMessage({
    conversation: conv,
    sender: req.user,
    audioUrl: `/api/media/voice/${req.file.filename}`,
    audioDurationMs: durationMs || null,
  });
  res.status(201).json({ message });
});

// POST /api/conversations/:id/read — mark partner messages as read.
router.post('/:id/read', async (req, res) => {
  const conv = await chat.findConversation(req.params.id);
  if (!conv || !chat.isMember(conv, req.user.id)) {
    return res.status(404).json({ error: 'conversation_not_found' });
  }
  const updated = await chat.markConversationRead(conv, req.user.id);
  res.json({ updated });
});

module.exports = router;
