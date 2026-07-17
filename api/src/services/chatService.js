const repos = require('../data/repos');
const { scanForRisk } = require('../utils/safety');
const { emitToUser, emitToAdmins } = require('../realtime');
const push = require('./pushService');
const risk = require('./riskService');

const isMember = (conv, userId) =>
  conv && (conv.patientId === userId || conv.specialistId === userId);

const partnerOf = (conv, userId) =>
  conv.patientId === userId ? conv.specialistId : conv.patientId;

/**
 * Persists a message, runs the safety scan on patient messages, and pushes
 * socket events to both participants (and admins on a safety hit).
 * Voice messages carry audioUrl/audioDurationMs with empty text; the safety
 * scan is text-based, so audio skips it (documented limitation).
 */
async function sendMessage({ conversation, sender, text = '', audioUrl, audioDurationMs }) {
  const riskFlag = !audioUrl && sender.role === 'patient' && scanForRisk(text);
  const message = await repos.insertMessage({
    conversationId: conversation.id,
    senderId: sender.id,
    text,
    audioUrl,
    audioDurationMs,
    riskFlag,
  });

  if (riskFlag) {
    const alert = await repos.insertSafetyAlert({
      patientId: sender.id,
      specialistId: conversation.specialistId,
      messageId: message.id,
      source: 'chat',
      status: 'open',
    });
    emitToUser(conversation.specialistId, 'safety:alert', { alert, message });
    emitToAdmins('safety:alert', { alert, message });
    push.pushSafetyAlert({ alert, patient: sender }); // fire-and-forget
  }

  const recipientId = partnerOf(conversation, sender.id);
  emitToUser(recipientId, 'message:new', { message });
  emitToUser(sender.id, 'message:new', { message });
  push.pushNewMessage({ message, sender, recipientId }); // fire-and-forget
  if (!audioUrl) risk.scanMessageAsync({ message, sender, conversation }); // fire-and-forget LLM layer
  return message;
}

async function markConversationRead(conversation, readerId) {
  const { changed, readAt } = await repos.markConversationRead(conversation.id, readerId);
  if (changed > 0) {
    emitToUser(partnerOf(conversation, readerId), 'conversation:read', {
      conversationId: conversation.id, readerId, readAt,
    });
  }
  return changed;
}

module.exports = {
  findConversation: repos.findConversation,
  getOrCreateConversation: repos.getOrCreateConversation,
  messagesOf: repos.messagesOf,
  lastMessageOf: repos.lastMessageOf,
  unreadCountFor: repos.unreadCountFor,
  isMember, partnerOf, sendMessage, markConversationRead,
};
