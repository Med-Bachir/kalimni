import { useEffect } from 'react';
import { useAuth } from '../store/auth';
import { navigate } from '../navigation/navigationRef';
import { registerDevice, onNotificationTap } from '../notifications/push';

// Registers the device for push once a usable session exists, and routes
// notification taps to the right screen. Mounted once in RootNavigator.
export function usePushNotifications() {
  const user = useAuth((s) => s.user);
  // Pending specialists sit on a blocking approval screen — don't register.
  const active = !!user && !(user.role === 'specialist' && user.status !== 'approved');

  useEffect(() => {
    if (!active) return;
    registerDevice().catch((err) => console.log('[push] registration skipped:', err?.message));
  }, [active, user?.id]);

  useEffect(() => {
    if (!active) return undefined;
    return onNotificationTap((data) => {
      if (data.type === 'message' || data.type === 'missed-call') {
        navigate(user.role === 'specialist' ? 'Chats' : 'ChatTab');
      } else if (data.type === 'safety') {
        navigate(user.role === 'specialist' ? 'Patients' : 'ChatTab');
      }
    });
  }, [active, user?.id, user?.role]);
}
