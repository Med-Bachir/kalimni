import { useEffect } from 'react';
import { getSocket } from '../api/socket';
import { useAuth } from '../store/auth';
import { useCall } from '../store/call';
import { navigate } from '../navigation/navigationRef';

// Mounted once at the app root. Listens for call events regardless of which
// screen is currently open and drives navigation to the incoming-call /
// active-call screens. CallScreen and IncomingCallScreen react to store
// state changes for everything else (mute, hangup cleanup, etc).
export function useCallSignaling() {
  const userId = useAuth((s) => s.user?.id);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !userId) return undefined;

    const onIncoming = (payload) => {
      useCall.getState().receiveIncoming(payload);
      navigate('IncomingCall');
    };
    const onAccepted = () => useCall.getState().remoteAccepted();
    const onRejected = () => useCall.getState().remoteRejected();
    const onEnded = () => useCall.getState().remoteEnded();

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
    };
  }, [userId]);
}
