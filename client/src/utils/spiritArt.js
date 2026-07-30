// Habitat art for the six spirit animals — the place each one would go just to
// breathe, which is the last question the quiz asks.
//
// These are the only bitmaps in the app, and they are here because this is the
// one thing code is bad at. A View-drawn scene can do shape and depth (see
// Garden.js, which does exactly that); it cannot do soft atmospheric haze, a
// hundred layered trees receding into mist, or light bleeding along a horizon.
// So the environments are painted and the character is drawn in code — the
// creature on top of them is still components/SpiritAnimal.js, still breathing
// and blinking, because a static picture of an animal is a picture and an
// animal that breathes is company.
//
// Generated with Higgsfield (z_image, 4:3), then downscaled to 900px and
// compressed — 280KB for the set. See scripts/make-spirit-art.md for the exact
// prompts, so the set can be regenerated or extended without guessing at them.
//
// Every scene deliberately has an empty foreground across the lower third: that
// is where the animal stands.

const ART = {
  owl: require('../../assets/spirits/owl.jpg'),       // moonlit forest clearing
  deer: require('../../assets/spirits/deer.jpg'),     // birch wood at dusk, low mist
  fox: require('../../assets/spirits/fox.jpg'),       // an empty road through autumn hills
  turtle: require('../../assets/spirits/turtle.jpg'), // a still shore at dawn
  cat: require('../../assets/spirits/cat.jpg'),       // a rooftop above a lit city
  bear: require('../../assets/spirits/bear.jpg'),     // a valley lake under twilight
};

export const habitatFor = (id) => ART[id] || ART.owl;
