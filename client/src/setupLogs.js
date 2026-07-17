import { LogBox } from 'react-native';

// expo-notifications logs a console.error the moment it is imported in Expo Go
// (SDK 53+ removed remote push from Expo Go). It is cosmetic — the app fails
// soft and push works in a dev build — so filter that one message out of the
// LogBox overlay. Imported first in index.js so this runs before the expo-
// notifications module is ever evaluated. Never fires in a real dev build.
LogBox.ignoreLogs([/expo-notifications: Android Push notifications/]);
