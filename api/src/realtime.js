// Socket.IO layer: presence, live message push, typing indicators, read
// receipts and safety alerts. Messages are SENT over REST; sockets only push
// server events down, which keeps delivery logic in one place (chatService).
const repos = require('./data/repos');
const { verifyToken } = require('./utils/tokens');

let io = null;
const onlineSockets = new Map(); // userId -> Set<socketId>
const onlineUserIds = new Set();

function initRealtime(server) {
  const { Server } = require('socket.io');
  const config = require('./config');
  io = new Server(server, {
    cors: { origin: config.corsOrigins.length ? config.corsOrigins : '*' },
  });

  io.use(async (socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token || '');
      const user = payload && (await repos.findUserById(payload.sub));
      if (!user) return next(new Error('unauthorized'));
      socket.userId = user.id;
      next();
    } catch (err) {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket;
    socket.join(`user:${userId}`);
    if (!onlineSockets.has(userId)) onlineSockets.set(userId, new Set());
    onlineSockets.get(userId).add(socket.id);
    if (!onlineUserIds.has(userId)) {
      onlineUserIds.add(userId);
      io.emit('presence:update', { userId, online: true });
    }

    socket.on('typing', async ({ conversationId, typing }) => {
      try {
        const conv = await repos.findConversation(conversationId);
        if (!conv) return;
        if (conv.patientId !== userId && conv.specialistId !== userId) return;
        const partnerId = conv.patientId === userId ? conv.specialistId : conv.patientId;
        emitToUser(partnerId, 'typing', { conversationId, userId, typing: !!typing });
      } catch (err) {
        console.error('[realtime] typing lookup failed:', err.message);
      }
    });

    socket.on('disconnect', () => {
      const set = onlineSockets.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          onlineSockets.delete(userId);
          onlineUserIds.delete(userId);
          io.emit('presence:update', { userId, online: false });
        }
      }
    });
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

// Fire-and-forget: callers don't await. Admin accounts only change via seed,
// so a failed lookup only costs one missed toast, never a request.
function emitToAdmins(event, payload) {
  repos
    .listAdminIds()
    .then((ids) => ids.forEach((id) => emitToUser(id, event, payload)))
    .catch((err) => console.error('[realtime] emitToAdmins failed:', err.message));
}

module.exports = { initRealtime, emitToUser, emitToAdmins, onlineUserIds };
