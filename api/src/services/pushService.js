// Push notifications through Expo's push API (no SDK needed — plain fetch,
// available globally in Node 18+). Fire-and-forget by design: callers never
// await pushes on the request path, and every failure is logged, not thrown.
//
// Rules applied to every send:
//   - users with settings.notifications === false are skipped
//   - skipOnline drops recipients with a live socket (they already see the
//     event in-app; used for chat messages, never for safety alerts)
//   - tokens Expo reports as DeviceNotRegistered are deleted
const repos = require('../data/repos');
const { onlineUserIds } = require('../realtime');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100; // Expo's max messages per request

// Recipient-language helper (ar is the app default).
const L = (lang, ar, fr) => (lang === 'fr' ? fr : ar);

async function sendToUsers(userIds, build, { skipOnline = false } = {}) {
  try {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return;

    const targets = (await repos.pushTargetsOf(ids)).filter((t) => {
      if (t.settings && t.settings.notifications === false) return false;
      if (skipOnline && onlineUserIds.has(t.userId)) return false;
      return true;
    });
    if (!targets.length) return;

    const messages = targets.map((t) => ({
      to: t.token,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      ...build(t),
    }));

    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json = await res.json().catch(() => null);
      const tickets = Array.isArray(json?.data) ? json.data : [];
      await Promise.all(
        tickets.map((ticket, idx) =>
          ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
            ? repos.deletePushToken(chunk[idx].to)
            : null
        )
      );
    }
  } catch (err) {
    console.error('[push] send failed:', err.message);
  }
}

// New chat message -> recipient, only when they're not connected (a live
// socket means the in-app chat already showed it).
const pushNewMessage = ({ message, sender, recipientId }) =>
  sendToUsers(
    [recipientId],
    (t) => ({
      title: sender.name,
      body: message.audioUrl
        ? L(t.language, '🎤 رسالة صوتية', '🎤 Message vocal')
        : message.text.length > 120 ? `${message.text.slice(0, 117)}...` : message.text,
      data: { type: 'message', conversationId: message.conversationId },
    }),
    { skipOnline: true }
  );

// Safety alert -> the paged targets (assigned specialist by default; the
// alert service passes on-call/admin recipients for unassigned patients).
// Always pushed, online or not.
const pushSafetyAlert = ({ alert, patient, recipients }) =>
  sendToUsers(recipients || [alert.specialistId], (t) => ({
    title: L(t.language, 'تنبيه أمان ⚠️', 'Alerte de sécurité ⚠️'),
    body: L(
      t.language,
      `حالة ${patient?.name || 'مريض'} قد تشير إلى خطر — يرجى المتابعة في أقرب وقت.`,
      `L'état de ${patient?.name || 'un patient'} peut indiquer un risque — veuillez réagir au plus vite.`
    ),
    data: { type: 'safety', alertId: alert.id, patientId: alert.patientId },
  }));

// Ring timeout -> tell the callee someone tried to reach them.
const pushMissedCall = ({ call, caller }) =>
  sendToUsers([call.calleeId], (t) => ({
    title: L(t.language, 'مكالمة فائتة', 'Appel manqué'),
    body: L(t.language, `حاول ${caller.name} الاتصال بك.`, `${caller.name} a essayé de vous appeler.`),
    data: { type: 'missed-call', conversationId: call.conversationId },
  }));

module.exports = { sendToUsers, pushNewMessage, pushSafetyAlert, pushMissedCall };
