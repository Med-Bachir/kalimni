const express = require('express');
const repos = require('../data/repos');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../schemas');
const { emitToUser, onlineUserIds } = require('../realtime');
const { userCard } = require('../utils/serialize');
const chat = require('../services/chatService');
const call = require('../services/callService');
const push = require('../services/pushService');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

// Audio calls over Agora. Signaling (ringing/accept/reject/end) works
// regardless of configuration; joining the actual audio channel needs
// AGORA_APP_ID (see .env.example) — the client shows a "not configured"
// state instead of attempting to join when appId is empty.
const agoraPayload = (rtcUid, channel) => {
  // Agora requires a numeric uid, and the token must be minted for the exact
  // same value the client joins with. bigint columns come back from
  // node-postgres as strings, so coerce here — otherwise the token is bound
  // to "154831696" while joinChannel gets a mismatched value and the join
  // fails with an invalid-token error.
  const uid = Number(rtcUid);
  return {
    appId: config.agoraAppId || null,
    token: call.buildToken(channel, uid),
    uid,
  };
};

// POST /api/calls/invite { conversationId, media?: 'voice'|'video' }
router.post('/invite', validate(schemas.callInvite), async (req, res) => {
  const { conversationId } = req.body;
  const media = req.body.media === 'video' ? 'video' : 'voice';
  const conv = conversationId ? await chat.findConversation(conversationId) : null;
  if (!conv || !chat.isMember(conv, req.user.id)) {
    return res.status(404).json({ error: 'conversation_not_found' });
  }
  if (req.user.role === 'specialist' && req.user.status !== 'approved') {
    return res.status(403).json({ error: 'specialist_not_approved' });
  }
  if (await repos.findActiveCall(conversationId)) {
    return res.status(409).json({ error: 'call_in_progress' });
  }

  const calleeId = chat.partnerOf(conv, req.user.id);
  const channel = `call_${conv.id}`;
  const record = await repos.insertCall({
    conversationId,
    callerId: req.user.id,
    calleeId,
    channel,
    media,
    callerUid: call.numericUid(req.user.id),
    calleeUid: call.numericUid(calleeId),
    status: 'ringing',
  });

  emitToUser(calleeId, 'call:incoming', {
    call: { id: record.id, conversationId, channel, media },
    caller: userCard(req.user, onlineUserIds),
  });

  res.status(201).json({ call: record, ...agoraPayload(record.callerUid, channel) });
});

// POST /api/calls/:id/accept — callee only, while still ringing.
router.post('/:id/accept', async (req, res) => {
  const record = await repos.findCall(req.params.id);
  if (!record || record.calleeId !== req.user.id) return res.status(404).json({ error: 'call_not_found' });
  if (record.status !== 'ringing') return res.status(409).json({ error: 'call_not_ringing' });

  const updated = await repos.updateCall(record.id, {
    status: 'active', acceptedAt: new Date().toISOString(),
  });
  emitToUser(updated.callerId, 'call:accepted', { call: updated });

  res.json({ call: updated, ...agoraPayload(updated.calleeUid, updated.channel) });
});

// POST /api/calls/:id/reject — callee declines while ringing.
router.post('/:id/reject', async (req, res) => {
  const record = await repos.findCall(req.params.id);
  if (!record || record.calleeId !== req.user.id) return res.status(404).json({ error: 'call_not_found' });
  if (record.status !== 'ringing') return res.status(409).json({ error: 'call_not_ringing' });

  const updated = await repos.updateCall(record.id, {
    status: 'ended', outcome: 'rejected', endedAt: new Date().toISOString(),
  });
  emitToUser(updated.callerId, 'call:rejected', { call: updated });

  res.json({ call: updated });
});

// POST /api/calls/:id/end — either party hangs up, cancels while ringing, or
// the caller gives up after a client-side ring timeout (outcome: missed).
router.post('/:id/end', async (req, res) => {
  const record = await repos.findCall(req.params.id);
  if (!record || ![record.callerId, record.calleeId].includes(req.user.id)) {
    return res.status(404).json({ error: 'call_not_found' });
  }
  if (record.status === 'ended') return res.json({ call: record });

  const wasActive = record.status === 'active';
  const { outcome } = req.body || {};
  const updated = await repos.updateCall(record.id, {
    status: 'ended',
    outcome: wasActive ? 'completed' : outcome === 'missed' ? 'missed' : 'cancelled',
    endedAt: new Date().toISOString(),
  });

  const otherId = req.user.id === updated.callerId ? updated.calleeId : updated.callerId;
  emitToUser(otherId, 'call:ended', { call: updated });

  // Ring timeout (caller gave up): let the callee know they were wanted.
  if (updated.outcome === 'missed') {
    push.pushMissedCall({ call: updated, caller: req.user }); // fire-and-forget
  }

  res.json({ call: updated });
});

module.exports = router;
