import { create } from 'zustand';
import { api } from '../api/client';
import { navigate, replace, goBackSafe } from '../navigation/navigationRef';

// Call lifecycle: idle -> outgoing (caller waiting) / incoming (callee ringing)
// -> active (both accepted; CallScreen manages the actual "audio connected"
// sub-state from Agora's onUserJoined) -> ended -> idle.
//
// endedReason drives the one-line status text shown while the screen unwinds:
// 'you-ended' | 'you-rejected' | 'remote-rejected' | 'remote-ended' | 'missed' | 'error'
const RING_TIMEOUT_MS = 45_000;

let ringTimeout = null;
const clearRingTimeout = () => {
  if (ringTimeout) clearTimeout(ringTimeout);
  ringTimeout = null;
};

export const useCall = create((set, get) => ({
  status: 'idle',
  call: null, // { id, conversationId, channel }
  partner: null, // userCard of the other participant
  agora: null, // { appId, token, uid } | null
  endedReason: null,

  // Caller: pressed the voice- or video-call button in a chat.
  startCall: async (conversationId, partner, media = 'voice') => {
    if (get().status !== 'idle') return;
    set({ status: 'outgoing', partner, call: { conversationId, media }, agora: null, endedReason: null });
    navigate('Call');
    try {
      const res = await api('/calls/invite', { method: 'POST', body: { conversationId, media } });
      if (get().status !== 'outgoing') return; // ended/cancelled while the request was in flight
      set({ call: res.call, agora: { appId: res.appId, token: res.token, uid: res.uid } });
      clearRingTimeout();
      ringTimeout = setTimeout(() => {
        if (get().status === 'outgoing') get().end('missed');
      }, RING_TIMEOUT_MS);
    } catch {
      set({ status: 'ended', endedReason: 'error' });
      get().reset(1500);
    }
  },

  // Callee: server pushed call:incoming over the socket.
  receiveIncoming: ({ call, caller }) => {
    if (get().status !== 'idle') return; // already on a call — silently ignore (no call-waiting yet)
    set({ status: 'incoming', call, partner: caller, agora: null, endedReason: null });
  },

  accept: async () => {
    const { call } = get();
    if (!call) return;
    set({ status: 'active' });
    replace('Call'); // swap out IncomingCall so a single hangup returns to where the callee was
    try {
      const res = await api(`/calls/${call.id}/accept`, { method: 'POST' });
      set({ call: res.call, agora: { appId: res.appId, token: res.token, uid: res.uid } });
    } catch {
      set({ status: 'ended', endedReason: 'error' });
      get().reset(1500);
    }
  },

  reject: () => {
    const { call } = get();
    clearRingTimeout();
    set({ status: 'ended', endedReason: 'you-rejected' });
    if (call?.id) api(`/calls/${call.id}/reject`, { method: 'POST' }).catch(() => {});
    get().reset(1000);
  },

  // Caller's socket handler: callee accepted — hand over their Agora payload
  // if it arrived this way in the future; today the caller already has its
  // own token from /invite, this just flips confirmation state.
  remoteAccepted: () => {
    if (get().status === 'outgoing') clearRingTimeout();
  },

  remoteRejected: () => {
    clearRingTimeout();
    set({ status: 'ended', endedReason: 'remote-rejected' });
    get().reset(1500);
  },

  remoteEnded: () => {
    clearRingTimeout();
    set({ status: 'ended', endedReason: 'remote-ended' });
    get().reset(1200);
  },

  // Local hangup, from an active or still-ringing (outgoing) call.
  end: (reason = 'you-ended') => {
    const { call } = get();
    clearRingTimeout();
    set({ status: 'ended', endedReason: reason });
    if (call?.id) api(`/calls/${call.id}/end`, { method: 'POST', body: { outcome: reason === 'missed' ? 'missed' : undefined } }).catch(() => {});
    get().reset(reason === 'missed' ? 800 : 1000);
  },

  // Always follows a transition to 'ended': shows the reason briefly (the
  // delay), then pops whichever call screen is on top and clears state.
  reset: (delay = 0) => {
    clearRingTimeout();
    const clear = () => {
      goBackSafe();
      set({ status: 'idle', call: null, partner: null, agora: null, endedReason: null });
    };
    if (delay) setTimeout(clear, delay);
    else clear();
  },
}));
