import * as Haptics from 'expo-haptics';

// Thin wrapper so call sites stay one word and nothing ever throws: haptics are
// a nicety, and an unsupported device or a denied permission must never break
// an interaction. Every call is fire-and-forget.
//
// Kept deliberately small — three intensities, used consistently:
//   tap()       every press (the app feels responsive)
//   success()   something was saved or completed
//   celebrate() a milestone — the only "big" feedback in the app

const safe = (fn) => () => {
  try {
    const result = fn();
    if (result?.catch) result.catch(() => {});
  } catch {
    // ignore — a device without a haptic motor is not an error
  }
};

export const tap = safe(() => Haptics.selectionAsync());

export const success = safe(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
);

export const warn = safe(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
);

// Two beats: a heavy hit, then a lighter echo. Reads as "something happened"
// rather than "something went wrong".
export const celebrate = safe(() => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  setTimeout(() => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))(), 140);
});
