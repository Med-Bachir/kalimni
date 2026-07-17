const { RtcTokenBuilder, RtcRole } = require('agora-token');
const config = require('../config');

const TOKEN_TTL_SECONDS = 3600;

// Agora channels use a numeric uid per participant. Derive a stable one from
// the user id so the same person always joins with the same uid — good
// enough for a two-party call; collisions are a non-issue at this scale.
const numericUid = (userId) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return (hash % 2147483000) + 1;
};

// Returns null when Agora isn't configured, or when the project runs in
// "App ID only" testing mode (no certificate) — the client still joins fine
// with a null token in that mode.
const buildToken = (channel, rtcUid) => {
  if (!config.agoraAppId || !config.agoraAppCertificate) return null;
  // agora-token v2 (AccessToken2) expects DURATIONS in seconds from now,
  // not absolute timestamps — passing Date.now()/1000 + ttl would mint
  // tokens valid for ~56 years.
  return RtcTokenBuilder.buildTokenWithUid(
    config.agoraAppId,
    config.agoraAppCertificate,
    channel,
    rtcUid,
    RtcRole.PUBLISHER,
    TOKEN_TTL_SECONDS,
    TOKEN_TTL_SECONDS
  );
};

module.exports = { numericUid, buildToken };
