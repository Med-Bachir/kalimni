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
  let messages = await chat.messagesOf(conv.id);

  // Voice-note transcripts are attached for the SPECIALIST only: they exist
  // for risk screening, and machine output is never shown back to the patient
  // as if it were their words. Attached on COPIES — never mutate rows the
  // data layer owns, that is how a field leaks into another viewer's payload.
  if (req.user.id === conv.specialistId) {
    const transcripts = await repos.voiceTranscriptsOf(conv.id);
    const byMessage = new Map(transcripts.map((t) => [t.messageId, t]));
    messages = messages.map((m) => {
      if (!m.audioUrl) return m;
      const t = byMessage.get(m.id);
      // No row = sent before screening existed -> surface as unmonitored.
      return { ...m, transcript: t ? { text: t.text, status: t.status } : { text: null, status: 'unavailable' } };
    });
  }

  res.json({
    conversation: await serializeConversation(conv, req.user.id),
    messages,
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
// Same guards as the text route. The safety scan runs on the transcript,
// asynchronously (voiceScreeningService) — slower than the keyword scan on
// text, which is why voice is unavailable while a safety alert is open: in
// that window the monitored text pathway is the only one offered.
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
  if (req.user.role === 'patient' && (await repos.countOpenAlertsOf(req.user.id)) > 0) {
    cleanup();
    return res.status(403).json({ error: 'voice_unavailable_during_alert' });
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
    audioFilePath: req.file.path,
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
