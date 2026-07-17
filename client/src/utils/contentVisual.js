// Category glyph for content gradient tiles. Articles have no photos, so a
// category icon on the gradient keeps tiles meaningful — offline, instant,
// license-free (external images would add cost and visual noise).
export const categoryIcon = (category) =>
  ({
    anxiety: 'pulse',
    sleep: 'moon',
    growth: 'trending-up',
    exercises: 'fitness',
  })[category] || 'book';

// Ink tone that reads well on all four pastel gradients.
export const GRADIENT_ICON_COLOR = 'rgba(20,49,63,.4)';
