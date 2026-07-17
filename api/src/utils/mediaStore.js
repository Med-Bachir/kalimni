// Disk storage for voice messages. Single home for the path logic so the
// upload route, the serving route and the account-deletion cleanup agree.
const fs = require('fs');
const path = require('path');

const VOICE_DIR = path.join(__dirname, '..', '..', 'uploads', 'voice');
fs.mkdirSync(VOICE_DIR, { recursive: true });

// '/api/media/voice/vm_x.m4a' or a bare filename -> absolute safe path
// (basename() is the path-traversal guard).
const voiceFilePath = (nameOrUrl) => path.join(VOICE_DIR, path.basename(String(nameOrUrl)));

// Best-effort delete; never throws (privacy cleanup must not block deletion).
const deleteVoiceFile = (url) => fs.unlink(voiceFilePath(url), () => {});

module.exports = { VOICE_DIR, voiceFilePath, deleteVoiceFile };
