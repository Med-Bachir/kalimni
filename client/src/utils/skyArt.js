// Painted backdrops for the collectible skies.
//
// FIVE OF THE EIGHT ARE PAINTINGS. THREE ARE DRAWN IN CODE, ON PURPOSE.
//
// The split is not "we ran out of budget" (though we did — the generation
// allowance ended after five). It is the same rule the spirit habitats follow,
// and it happens to fall along exactly the right line:
//
//   painted   dawn, morning, noon, rainy, dusk — skies whose whole character is
//             CLOUD STRUCTURE and gouache texture. Soft irregular edges, wisps
//             thinning to nothing, layered translucency. Views and gradients
//             are genuinely bad at that; every attempt looks like lozenges.
//
//   code      night, aurora, firstSun — skies whose whole character is LIGHT.
//             A starfield, drifting bands of glow, a low sun bleeding along the
//             horizon. Gradients and opacity are exactly the right tool, and
//             code wins something a painting cannot have: they MOVE. The aurora
//             drifts, the stars breathe, the sunrise pulses.
//
// So the three that were left over are the three that should have been code
// anyway. If the remaining generations are ever bought, think twice before
// replacing them — a still image would be a downgrade for all three.
//
// Weight: all five paintings together are ~115 KB at 1000px / JPEG q82. They
// are smooth gradient art, which compresses far better than the habitat scenes.

const ART = {
  dawn: require('../../assets/skies/dawn.jpg'),
  morning: require('../../assets/skies/morning.jpg'),
  noon: require('../../assets/skies/noon.jpg'),
  rainy: require('../../assets/skies/rainy.jpg'),
  dusk: require('../../assets/skies/dusk.jpg'),
};

/**
 * The painting for a sky, or null when that sky is drawn in code.
 *
 * Null is a normal, expected answer — Garden branches on it — so this must not
 * fall back to another sky's art the way habitatFor does. Handing `aurora` the
 * dawn painting would be worse than drawing nothing.
 */
export const skyImageFor = (id) => ART[id] ?? null;

/** True when this sky is one the code draws itself. */
export const isDrawnSky = (id) => !ART[id];
