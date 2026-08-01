// Test harness for the CJS API codebase.
//
// App modules are loaded through Node's own require cache (createRequire from
// a CJS file — this file), NOT through Vitest's transform pipeline. On first
// load this file replaces every export of data/repos (and the transcription
// service) with a stable delegating wrapper; each test installs a fresh
// in-memory fake behind the wrappers. Modules that captured references at
// load time (chatService does) captured the wrappers, so installs always
// take effect.
const repos = require('../../src/data/repos');
const transcription = require('../../src/services/transcriptionService');
const rag = require('../../src/services/ragService');
const llm = require('../../src/services/llmClient');
const riskService = require('../../src/services/riskService');
const express = require('express');

// --- stable delegation --------------------------------------------------------
let currentRepos = null;
for (const name of Object.keys(repos)) {
  repos[name] = (...args) => {
    if (!currentRepos) throw new Error(`fake repos not installed (call install) — ${name}`);
    const fn = currentRepos[name];
    if (!fn) throw new Error(`fake repos: '${name}' was called but is not implemented`);
    return fn(...args);
  };
}

let currentTranscription = null; // null -> real implementation (unconfigured in tests)
const realTranscription = { ...transcription };
transcription.transcribeFile = (...a) =>
  (currentTranscription || realTranscription).transcribeFile(...a);
transcription.isConfigured = (...a) =>
  (currentTranscription || realTranscription).isConfigured(...a);

// RAG talks to pg directly and lazy-downloads an embedding model — neither
// belongs in a unit test. Default: retrieval finds nothing.
let currentRetrieve = async () => [];
rag.retrieve = (...a) => currentRetrieve(...a);

// LLM chat calls (companion generation AND the risk classifier's internals go
// through llm.chatJson). null -> real client (throws ai_not_configured in
// tests, since AI_API_KEY is empty).
let currentChatJson = null;
const realChatJson = llm.chatJson;
llm.chatJson = (...a) => (currentChatJson ? currentChatJson(...a) : realChatJson(...a));

// riskService.classify as seen by EXTERNAL callers (companionService's gate).
// Note: riskService's own scanMessageAsync calls its local classify binding,
// which this does NOT intercept — use installChatJson for that path.
let currentClassify = null;
const realClassify = riskService.classify;
riskService.classify = (...a) => (currentClassify ? currentClassify(...a) : realClassify(...a));

const installRepos = (impl) => { currentRepos = impl; };
const installTranscription = (impl) => { currentTranscription = impl; };
const installRetrieve = (fn) => { currentRetrieve = fn || (async () => []); };
const installChatJson = (fn) => { currentChatJson = fn; };
const installClassify = (fn) => { currentClassify = fn; };

// --- in-memory fake ------------------------------------------------------------
function makeFakeRepos() {
  let seq = 0;
  const uid = (p) => `${p}_${++seq}`;
  const state = {
    users: new Map(),          // id -> user
    conversations: new Map(),  // id -> conversation
    messages: new Map(),       // id -> message
    transcripts: new Map(),    // messageId -> {messageId, text, status}
    alerts: new Map(),         // id -> alert
    aiConversations: new Map(),// patientId -> conversation
    aiMessages: [],            // rows with conversationId
    aiStates: new Map(),       // conversationId -> state
    pushTokens: new Map(),     // token -> {token, userId, platform}
    rota: new Map(),           // id -> {id, specialistId, tier, startsAt, endsAt}
    escalations: [],           // append-only page audit rows
    riskFailures: new Map(),   // messageId -> failure row
  };

  const impl = {
    // users
    findUserById: async (id) => state.users.get(id) || null,
    findUserByEmail: async (email) =>
      [...state.users.values()].find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null,
    insertUser: async (u) => {
      const user = { id: uid('u'), settings: { notifications: true }, createdAt: new Date().toISOString(), ...u };
      state.users.set(user.id, user);
      return user;
    },
    listAdminIds: async () =>
      [...state.users.values()].filter((u) => u.role === 'admin').map((u) => u.id),

    // content (companion suggestions) — empty library by default
    listContent: async () => [],

    // conversations / messages
    findConversation: async (id) => state.conversations.get(id) || null,
    insertMessage: async (m) => {
      const message = {
        id: uid('m'), text: '', audioUrl: m.audioUrl || null, audioDurationMs: m.audioDurationMs || null,
        riskFlag: !!m.riskFlag, readAt: null, createdAt: new Date().toISOString(), ...m,
      };
      state.messages.set(message.id, message);
      return message;
    },
    findMessage: async (id) => state.messages.get(id) || null,
    findMessageByAudioUrl: async (url) =>
      [...state.messages.values()].find((m) => m.audioUrl === url) || null,
    setMessageRiskFlag: async (id) => {
      const m = state.messages.get(id);
      if (m) m.riskFlag = true;
      return m || null;
    },
    messagesOf: async (conversationId) =>
      [...state.messages.values()].filter((m) => m.conversationId === conversationId),
    lastMessageOf: async (conversationId) =>
      [...state.messages.values()].filter((m) => m.conversationId === conversationId).at(-1) || null,
    unreadCountFor: async () => 0,
    markConversationRead: async () => ({ changed: 0, readAt: null }),

    // voice transcripts
    saveVoiceTranscript: async ({ messageId, text, status }) => {
      const row = { messageId, text: text || null, status };
      state.transcripts.set(messageId, row);
      return row;
    },
    voiceTranscriptsOf: async (conversationId) =>
      [...state.transcripts.values()].filter((t) => {
        const m = state.messages.get(t.messageId);
        return m && m.conversationId === conversationId;
      }),

    // safety alerts
    insertSafetyAlert: async (a) => {
      const alert = { id: uid('sa'), status: 'open', createdAt: new Date().toISOString(), ...a };
      state.alerts.set(alert.id, alert);
      return alert;
    },
    findSafetyAlert: async (id) => state.alerts.get(id) || null,
    updateSafetyAlert: async (id, patch) => {
      const a = state.alerts.get(id);
      if (a) Object.assign(a, patch);
      return a || null;
    },
    countOpenAlertsOf: async (patientId) =>
      [...state.alerts.values()].filter((a) => a.patientId === patientId && a.status === 'open').length,
    hasOpenAiAlert: async (patientId) =>
      [...state.alerts.values()].some(
        (a) => a.patientId === patientId && a.source === 'ai_chat' && a.status === 'open'
      ),
    // detail.hold missing => legacy alert => implied hold (mirrors the SQL COALESCE).
    hasOpenAiHoldAlert: async (patientId) =>
      [...state.alerts.values()].some(
        (a) => a.patientId === patientId && a.source === 'ai_chat' && a.status === 'open'
          && (a.detail?.hold === undefined || a.detail.hold === true)
      ),
    openSafetyAlerts: async () =>
      [...state.alerts.values()].filter((a) => a.status === 'open'),
    listSafetyAlerts: async (specialistId) =>
      [...state.alerts.values()].filter((a) => !specialistId || a.specialistId === specialistId),
    listSafetyAlertsVisibleTo: async (specialistId) =>
      [...state.alerts.values()].filter(
        (a) => a.specialistId === specialistId
          || state.escalations.some((e) => e.alertId === a.id && e.notifiedId === specialistId)
      ),
    listCriticalOpenAlerts: async () =>
      [...state.alerts.values()].filter(
        (a) => a.status === 'open' && state.escalations.some((e) => e.alertId === a.id && e.tier === 2)
      ),

    // on-call rota + escalation audit
    insertOnCallRota: async (r) => {
      const row = { id: uid('rota'), tier: 1, ...r };
      state.rota.set(row.id, row);
      return row;
    },
    deleteOnCallRota: async (id) => state.rota.delete(id),
    listOnCallRota: async () => [...state.rota.values()],
    onCallSpecialistsAt: async (at, tier) => {
      const ts = new Date(at).getTime();
      return [...state.rota.values()].filter(
        (r) => r.tier === tier && new Date(r.startsAt).getTime() <= ts && new Date(r.endsAt).getTime() > ts
      );
    },
    insertAlertEscalation: async (e) => {
      const row = { id: uid('esc'), actionTaken: null, notifiedAt: new Date().toISOString(), acknowledgedAt: null, ...e };
      state.escalations.push(row);
      return row;
    },
    escalationsOf: async (alertId) => state.escalations.filter((e) => e.alertId === alertId),
    wasNotifiedForAlert: async (alertId, userId) =>
      state.escalations.some((e) => e.alertId === alertId && e.notifiedId === userId),
    ackAlertEscalations: async (alertId, at) => {
      state.escalations
        .filter((e) => e.alertId === alertId && !e.acknowledgedAt)
        .forEach((e) => { e.acknowledgedAt = at || new Date().toISOString(); });
    },

    // risk scan dead letters
    upsertRiskScanFailure: async ({ kind, messageId, error }) => {
      const existing = state.riskFailures.get(messageId);
      if (existing) {
        existing.attempts += 1;
        existing.lastError = error;
        existing.retriedAt = new Date().toISOString();
        return existing;
      }
      const row = {
        id: uid('rsf'), kind, messageId, attempts: 1, lastError: error,
        createdAt: new Date().toISOString(), retriedAt: null, resolvedAt: null,
      };
      state.riskFailures.set(messageId, row);
      return row;
    },
    openRiskScanFailures: async (limit = 10, maxAttempts = 5) =>
      [...state.riskFailures.values()]
        .filter((f) => !f.resolvedAt && f.attempts < maxAttempts)
        .slice(0, limit),
    resolveRiskScanFailure: async (id) => {
      const row = [...state.riskFailures.values()].find((f) => f.id === id);
      if (row) row.resolvedAt = new Date().toISOString();
    },
    countOpenRiskScanFailures: async () =>
      [...state.riskFailures.values()].filter((f) => !f.resolvedAt).length,
    getVoiceTranscript: async (messageId) => state.transcripts.get(messageId) || null,

    // AI companion
    getOrCreateAiConversation: async (patientId) => {
      if (!state.aiConversations.has(patientId)) {
        state.aiConversations.set(patientId, {
          id: uid('aic'), patientId, status: 'active', createdAt: new Date().toISOString(),
        });
      }
      return state.aiConversations.get(patientId);
    },
    getAiConversation: async (patientId) => state.aiConversations.get(patientId) || null,
    setAiConversationStatus: async (id, status) => {
      const conv = [...state.aiConversations.values()].find((c) => c.id === id);
      if (conv) conv.status = status;
      return conv || null;
    },
    insertAiMessage: async (m) => {
      const row = { id: uid('aim'), risk: 'none', suggestions: [], createdAt: new Date().toISOString(), ...m };
      state.aiMessages.push(row);
      return row;
    },
    aiMessagesOf: async (conversationId, limit = 50) =>
      state.aiMessages.filter((m) => m.conversationId === conversationId).slice(-limit),
    lastAiMessageAt: async (conversationId) =>
      state.aiMessages.filter((m) => m.conversationId === conversationId).at(-1)?.createdAt || null,
    getAiState: async (conversationId) => state.aiStates.get(conversationId) || null,
    upsertAiState: async (conversationId, patch) => {
      const cur = state.aiStates.get(conversationId) || { conversationId, summary: '', topics: [], messagesSinceSummary: 0 };
      Object.assign(cur, patch);
      state.aiStates.set(conversationId, cur);
      return cur;
    },
    bumpAiMessageCount: async (conversationId, by = 1) => {
      const cur = state.aiStates.get(conversationId) || { conversationId, messagesSinceSummary: 0 };
      cur.messagesSinceSummary += by;
      state.aiStates.set(conversationId, cur);
      return cur;
    },
    deleteAiThread: async (patientId) => {
      const conv = state.aiConversations.get(patientId);
      if (conv) {
        state.aiMessages = state.aiMessages.filter((m) => m.conversationId !== conv.id);
        state.aiStates.delete(conv.id);
        state.aiConversations.delete(patientId);
      }
      // trigger redaction (mirrors the SQL in repos.deleteAiThread)
      for (const a of state.alerts.values()) {
        if (a.patientId === patientId && a.source === 'ai_chat' && a.detail && 'trigger' in a.detail) {
          delete a.detail.trigger;
          a.detail.triggerRedacted = true;
        }
      }
    },

    // push tokens (mirrors the ownership predicates in the SQL)
    savePushToken: async (userId, token, platform) => {
      const row = state.pushTokens.get(token);
      if (row && row.userId !== userId) return false;
      state.pushTokens.set(token, { token, userId, platform: platform || null });
      return true;
    },
    deletePushTokenOwned: async (userId, token) => {
      const row = state.pushTokens.get(token);
      if (row && row.userId === userId) state.pushTokens.delete(token);
    },
    deletePushToken: async (token) => { state.pushTokens.delete(token); },
    pushTargetsOf: async () => [],
  };

  // convenience seeders
  const seed = {
    user: (props) => {
      const user = {
        id: uid('u'), role: 'patient', name: 'Test', email: `${uid('mail')}@t.dz`,
        passwordHash: '!', language: 'ar', settings: { notifications: true },
        assignedSpecialistId: null, createdAt: new Date().toISOString(), ...props,
      };
      state.users.set(user.id, user);
      return user;
    },
    conversation: (patient, specialist) => {
      const conv = { id: uid('c'), patientId: patient.id, specialistId: specialist.id, createdAt: new Date().toISOString() };
      state.conversations.set(conv.id, conv);
      return conv;
    },
    voiceMessage: (conv, sender, file) => {
      const message = {
        id: uid('m'), conversationId: conv.id, senderId: sender.id, text: '',
        audioUrl: `/api/media/voice/${file}`, audioDurationMs: 1000, riskFlag: false,
        readAt: null, createdAt: new Date().toISOString(),
      };
      state.messages.set(message.id, message);
      return message;
    },
  };

  return { state, impl, seed };
}

// --- express test app ----------------------------------------------------------
function buildApp(mounts) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  for (const [prefix, router] of Object.entries(mounts)) app.use(prefix, router);
  // Mirror index.js: async route rejections end as 500 JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: 'internal_error', detail: err.message });
  });
  return app;
}

// Fire-and-forget calls (voice screening, push) finish on later ticks.
const settle = () => new Promise((r) => setTimeout(r, 25));

module.exports = {
  installRepos, installTranscription, installRetrieve, installChatJson, installClassify,
  makeFakeRepos, buildApp, settle,
};
