import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

// Imperative navigation for events that don't originate from a screen —
// an incoming call can arrive while the user is anywhere in the app.
export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) navigationRef.navigate(name, params);
}

// Swaps the current screen instead of pushing — used when accepting a call
// so IncomingCall doesn't linger under Call on the stack (a single goBack
// from Call must land back on the screen the user was on before ringing).
export function replace(name, params) {
  if (navigationRef.isReady()) navigationRef.dispatch(StackActions.replace(name, params));
}

export function goBackSafe() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
}
