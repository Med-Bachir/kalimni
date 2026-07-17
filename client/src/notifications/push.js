// Device-side push plumbing: permission, Expo token, registration with the
// API, and tap handling. Kept store-free so the auth store can import it
// without a require cycle.
//
// Remote push needs a custom dev build (expo run:android) with FCM configured
// (google-services.json) — it does NOT work in Expo Go on SDK 53+. Every entry
// point here fails soft so the app runs fine before that setup is done.
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

let currentToken = null;

// Expo Go (SDK 53+) dropped remote push on Android; calling
// getExpoPushTokenAsync there logs a red console.error before it rejects. Detect
// it so we skip the token fetch entirely until there is a real dev build.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// App in foreground -> stay silent: the socket layer already surfaces new
// messages, calls and safety alerts inside the UI.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerDevice() {
  if (currentToken) return currentToken;
  // No remote push in Expo Go — bail before the token fetch that errors there.
  if (isExpoGo) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Kalimni',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  await api('/users/me/push-token', { method: 'POST', body: { token, platform: Platform.OS } });
  currentToken = token;
  return token;
}

// Called on logout BEFORE the auth token is cleared, so this device stops
// receiving the previous account's notifications.
export async function unregisterDevice() {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  await api('/users/me/push-token', { method: 'DELETE', body: { token } });
}

// Subscribes to notification taps; returns an unsubscribe function.
export function onNotificationTap(handler) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data || {});
  });
  return () => sub.remove();
}
