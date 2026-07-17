import Constants from 'expo-constants';

// In development the API host is derived from the Metro dev-server host, so a
// phone running Expo Go on the same Wi-Fi reaches the API with zero config.
// Override with EXPO_PUBLIC_API_URL (e.g. in client/.env) when needed.
const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
const devHost = hostUri ? hostUri.split(':')[0] : 'localhost';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${devHost}:4000/api`;
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');
