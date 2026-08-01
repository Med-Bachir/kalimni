import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../api/socket';
import { useAuth } from '../store/auth';

// Central socket -> react-query bridge. Mounted once per signed-in session:
// server pushes land here and refresh whichever screens are watching.
export function useRealtime() {
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.user?.id);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !userId) return undefined;

    const onMessage = ({ message }) => {
      queryClient.setQueryData(['messages', message.conversationId], (old) => {
        if (!old) return old;
        if (old.messages.some((m) => m.id === message.id)) return old;
        return { ...old, messages: [...old.messages, message] };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    };

    // A message changed after delivery — today only the async risk scan, which
    // flips riskFlag true. Replace it in place so the flagged styling/banner
    // appears live without a refetch.
    const onMessageUpdate = ({ message }) => {
      queryClient.setQueryData(['messages', message.conversationId], (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
        };
      });
    };

    const onRead = ({ conversationId, readAt }) => {
      queryClient.setQueryData(['messages', conversationId], (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.senderId === userId && !m.readAt ? { ...m, readAt } : m
          ),
        };
      });
    };

    const onPresence = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['mySpecialist'] });
    };

    const onMatching = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['mySpecialist'] });
      queryClient.invalidateQueries({ queryKey: ['adminRequests'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      useAuth.getState().refreshMe().catch(() => {});
    };

    const onPatients = () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const onSafety = ({ message } = {}) => {
      queryClient.invalidateQueries({ queryKey: ['safetyAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      // Fallback: refetch the thread so the flagged bubble is correct even if
      // the message:update event was missed.
      if (message?.conversationId) {
        queryClient.invalidateQueries({ queryKey: ['messages', message.conversationId] });
      }
    };

    // Escalation ladder: an alert crossed 60 min unacknowledged (critical),
    // or was acknowledged somewhere — refresh the banner + alert lists.
    const onSafetyLadder = () => {
      queryClient.invalidateQueries({ queryKey: ['criticalAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['safetyAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    };

    const onAccountStatus = () => {
      useAuth.getState().refreshMe().catch(() => {});
    };

    // Someone registered or deleted their account — refresh the admin views
    // that count/list users (they live in always-mounted tabs, so without
    // this they'd only update on app reload).
    const onUsers = () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      queryClient.invalidateQueries({ queryKey: ['pendingSpecialists'] });
      queryClient.invalidateQueries({ queryKey: ['unassignedPatients'] });
    };

    const onAppointment = () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    };

    socket.on('message:new', onMessage);
    socket.on('message:update', onMessageUpdate);
    socket.on('conversation:read', onRead);
    socket.on('presence:update', onPresence);
    socket.on('matching:update', onMatching);
    socket.on('matching:new', onMatching);
    socket.on('patients:update', onPatients);
    socket.on('safety:alert', onSafety);
    socket.on('safety:critical', onSafetyLadder);
    socket.on('safety:ack', onSafetyLadder);
    socket.on('account:status', onAccountStatus);
    socket.on('users:update', onUsers);
    socket.on('appointment:new', onAppointment);
    socket.on('appointment:update', onAppointment);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:update', onMessageUpdate);
      socket.off('conversation:read', onRead);
      socket.off('presence:update', onPresence);
      socket.off('matching:update', onMatching);
      socket.off('matching:new', onMatching);
      socket.off('patients:update', onPatients);
      socket.off('safety:alert', onSafety);
      socket.off('safety:critical', onSafetyLadder);
      socket.off('safety:ack', onSafetyLadder);
      socket.off('account:status', onAccountStatus);
      socket.off('users:update', onUsers);
      socket.off('appointment:new', onAppointment);
      socket.off('appointment:update', onAppointment);
    };
  }, [userId, queryClient]);
}
