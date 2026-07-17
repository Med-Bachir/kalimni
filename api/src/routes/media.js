// Serves uploaded voice messages. These are sensitive clinical content, so a
// valid JWT is required — via the Authorization header, or ?token= for audio
// players that cannot set request headers.
const express = require('express');
const { verifyToken } = require('../utils/tokens');
const { voiceFilePath } = require('../utils/mediaStore');

const router = express.Router();

router.get('/voice/:file', (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = bearer || String(req.query.token || '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'unauthorized' });

  res.sendFile(voiceFilePath(req.params.file), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'not_found' });
  });
});

module.exports = router;
