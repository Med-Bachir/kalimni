import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';

let socket = null;

export function connectSocket(token) {
  disconnectSocket();
  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export const getSocket = () => socket;
