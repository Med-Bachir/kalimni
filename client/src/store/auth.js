import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import { unregisterDevice } from '../notifications/push';

const TOKEN_KEY = 'kalimni.token';

export const useAuth = create((set, get) => ({
  user: null,
  token: null,
  booted: false,

  // Restore the session on app start.
  boot: async () => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        setAuthToken(token);
        const { user } = await api('/auth/me');
        connectSocket(token);
        set({ user, token, booted: true });
        return;
      }
    } catch {
      setAuthToken(null);
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
    set({ user: null, token: null, booted: true });
  },

  applySession: async ({ token, user }) => {
    setAuthToken(token);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    connectSocket(token);
    set({ user, token });
  },

  login: async (email, password) => {
    const session = await api('/auth/login', { method: 'POST', body: { email, password } });
    await get().applySession(session);
    return session.user;
  },

  register: async (payload) => {
    const session = await api('/auth/register', { method: 'POST', body: payload });
    await get().applySession(session);
    return session.user;
  },

  googleLogin: async (email, name) => {
    const session = await api('/auth/google', { method: 'POST', body: { email, name } });
    await get().applySession(session);
    return session.user;
  },

  refreshMe: async () => {
    const { user } = await api('/auth/me');
    set({ user });
    return user;
  },

  updateProfile: async (patch) => {
    const { user } = await api('/users/me', { method: 'PUT', body: patch });
    set({ user });
    return user;
  },

  deleteAccount: async () => {
    await api('/users/me', { method: 'DELETE' });
    await get().logout();
  },

  logout: async () => {
    // Before the auth token is cleared: stop this device from receiving the
    // account's notifications. Best-effort — never blocks logout.
    await unregisterDevice().catch(() => {});
    disconnectSocket();
    setAuthToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    set({ user: null, token: null });
  },
}));
