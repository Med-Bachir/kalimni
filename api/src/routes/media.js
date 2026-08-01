// Serves uploaded voice messages — sensitive clinical content. Every request
// must prove BOTH identity and ownership: the file has to belong to a message
// in a conversation the caller is a member of, and the caller has to still
// exist (a deleted account's tokens die with it).
//
// Two ways in:
//   - Authorization: Bearer <jwt>  (regular API clients)
//   - ?uid&exp&sig                 (60-second HMAC URL from POST /voice/:file/url,
//                                   for audio players that cannot set headers —
//                                   never a long-lived credential in a query
//                                   string, where proxies and CDNs log it)
const path = require('path');
const express = require('express');
const repos = require('../data/repos');
const { requireAuth } = require('../middleware/auth');
const rateLimits = require('../middleware/rateLimits');
const { verifyToken, signMediaUrl, verifyMediaSig } = require('../utils/tokens');
const { voiceFilePath } = require('../utils/mediaStore');
const chat = require('../services/chatService');

const router = express.Router();
router.use(rateLimits.media);

// Canonical filename (basename() is the path-traversal guard, same as
// mediaStore) -> the message that owns it, or null (unknown file) or false
// (file exists but the viewer is not a conversation member).
async function authorizedMessage(userId, rawFile) {
  const file = path.basename(String(rawFile));
  const message = await repos.findMessageByAudioUrl(`/api/media/voice/${file}`);
  if (!message) return null;
  const conv = await repos.findConversation(message.conversationId);
  return conv && chat.isMember(conv, userId) ? message : false;
}

const respondForbidden = (res, owned) =>
  owned === null
    ? res.status(404).json({ error: 'not_found' })
    : res.status(403).json({ error: 'forbidden' });

// POST /api/media/voice/:file/url — mint a short-lived playback URL for this
// caller. Ownership is checked here AND again on the GET (the 60s window must
// not outlive a deletion or membership change).
router.post('/voice/:file/url', requireAuth, async (req, res) => {
  const owned = await authorizedMessage(req.user.id, req.params.file);
  if (!owned) return respondForbidden(res, owned);
  res.json({ url: signMediaUrl(path.basename(String(req.params.file)), req.user.id), expiresInS: 60 });
});

// GET /api/media/voice/:file — stream the audio.
router.get('/voice/:file', async (req, res) => {
  const file = path.basename(String(req.params.file));

  // Identify the caller — bearer token, or a valid signed URL.
  let callerId = null;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    callerId = payload?.sub || null;
  } else if (verifyMediaSig(file, req.query.uid, req.query.exp, req.query.sig)) {
    callerId = String(req.query.uid);
  }
  if (!callerId) return res.status(401).json({ error: 'unauthorized' });

  // The account must still exist — a deleted user's token or URL is dead.
  const user = await repos.findUserById(callerId);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const owned = await authorizedMessage(user.id, file);
  if (!owned) return respondForbidden(res, owned);

  res.sendFile(voiceFilePath(file), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'not_found' });
  });
});

module.exports = router;
