import { I18nManager, DevSettings } from 'react-native';

// Arabic is RTL, French is LTR. React Native applies a direction change only
// after a reload: DevSettings.reload() covers Expo Go / dev builds; production
// builds pick the direction up on the next app start.
export function ensureLayoutDirection(lang) {
  const shouldRTL = lang === 'ar';
  if (I18nManager.isRTL === shouldRTL) return false;
  I18nManager.allowRTL(shouldRTL);
  I18nManager.forceRTL(shouldRTL);
  try {
    DevSettings.reload();
  } catch {
    // Production: direction applies on next launch.
  }
  return true;
}
