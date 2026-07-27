import Constants from 'expo-constants';

// In development the API host is derived from the Metro dev-server host, so a
// phone running Expo Go on the same Wi-Fi reaches the API with zero config.
// Override with EXPO_PUBLIC_API_URL (e.g. in client/.env) when needed.
const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
const devHost = hostUri ? hostUri.split(':')[0] : 'localhost';

// Where a release build points when nothing else says otherwise.
//
// This default is the whole point of the file. EXPO_PUBLIC_* variables are
// inlined by Babel at bundle time, so the URL is decided by whichever
// environment happened to run the bundler — and there are three of them, each
// reading a different source:
//
//   expo start   → client/.env          (gitignored, so it exists on no CI)
//   eas build    → eas.json build.env   (committed)
//   eas update   → the local shell      (reads client/.env, NOT eas.json)
//
// Miss any one of those and the old fallback resolved to
// http://localhost:4000/api, because `hostUri` is undefined outside a dev
// server. On a phone that means "connect to the phone itself", over cleartext
// HTTP, which Android release builds block outright — so it fails instantly and
// looks exactly like a dead server.
//
// Defaulting release builds to production makes that failure impossible. Dev
// keeps the LAN behaviour, and EXPO_PUBLIC_API_URL still overrides both.
const PRODUCTION_API = 'https://kalimni.onrender.com/api';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? `http://${devHost}:4000/api` : PRODUCTION_API);

export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');
