# Generated art

Two sets of bitmaps, and they are the only ones in the app:

- `assets/spirits/` — twelve habitat backdrops, one per spirit animal, showing
  the place that animal would go just to breathe. That is the last question the
  quiz asks (`spirit.quiz.place` in i18n), so the reveal answers the question
  the patient just answered.
- `assets/skies/` — **five of the eight** collectible skies for the garden.
  The other three are drawn in code; see "Skies" below for why that is a
  decision rather than an omission.

Everything else — the animals, the garden, the plants, the UI sounds — is
generated from code at runtime. The rule for reaching for a bitmap is narrow:
**only when code genuinely cannot do it.** Soft atmospheric haze, a hundred
layered trees receding into mist, gouache cloud texture. Shape, depth, colour
and light are not on that list; `Garden.js` does those in Views and stays
animatable.

The animal drawn on top of these is still `components/SpiritAnimal.js`, still
breathing and blinking. That split is deliberate and should survive any redesign:
**painted environment, code-drawn character.** A static picture of an animal is a
picture; an animal that breathes is company.

## Regenerating

Requires the Higgsfield CLI, authenticated, with a workspace selected:

```bash
npm i -g @higgsfield/cli
higgsfield auth login
higgsfield workspace list
higgsfield workspace set <workspace_id>
```

Model `z_image` at 4:3. Costs 0.15 credits per image — the whole set is under one
credit, so regenerating to taste is cheap. Check with
`higgsfield generate cost z_image --prompt "..."` before a bulk run.

```bash
higgsfield generate create z_image --aspect-ratio 4:3 --wait --prompt "<scene> <style>"
```

### Shared style suffix

Keep this **identical** across all six. It is the only thing making them read as
one set rather than six unrelated pictures, and it is also what keeps them in the
app's palette instead of arriving as saturated stock art.

```
Soft flat gouache illustration. Muted desaturated palette. Simple layered shapes,
minimal detail, gentle mist and atmospheric depth. Calm and still. Empty open
ground across the lower third. No animals, no people, no text, no letters.
Children's picture book style, soft edges, no outlines, low contrast, flat colour.
```

`Empty open ground across the lower third` is load-bearing — that band is where
the animal stands. `No animals` is also load-bearing: the scene must not contain
a second creature competing with the one drawn on top of it.

### Scenes

| id | scene |
| --- | --- |
| `owl` | A quiet moonlit forest clearing at night, viewed from a distance. Muted desaturated palette of deep teal, slate blue and warm sand. Gentle mist between the trees, a pale moon low in the sky. |
| `deer` | A quiet forest at dusk, tall slender birch trees, soft warm light filtering through low mist, distant rolling hills. Palette of dusty rose, warm sand and sage green. |
| `fox` | An empty country road winding away through low autumn hills at golden hour, a few scattered trees, long soft shadows. Palette of warm amber, terracotta and dusty green. |
| `turtle` | A still shore at dawn, very calm shallow water, low flat wet rocks, a soft pale sky, a distant headland. Palette of pale blue, sea green and warm sand. |
| `cat` | A quiet rooftop at night looking out over a distant lit city, a low parapet wall, a soft warm glow along the horizon. Palette of deep indigo, slate blue and warm amber lights. |
| `bear` | A wide quiet valley clearing under a starry twilight sky, a distant pine ridge, a still lake far below. Palette of deep teal, muted violet and warm sand. |

## Downscaling

The model returns ~2048x1536 PNGs at about 4 MB each — 24 MB for the set, which
has no business in a mobile bundle. Downscale to 900px wide and encode as JPEG
q84: that lands at ~280 KB for all six, and at the size the card actually renders
(roughly 340pt) the difference is invisible.

JPEG rather than PNG because nothing here needs transparency, and PNG at this
size is several times larger for smooth gradient art.

```powershell
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$prm = New-Object System.Drawing.Imaging.EncoderParameters(1)
$prm.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 84)
foreach ($id in @('owl','deer','fox','turtle','cat','bear')) {
  $img = [System.Drawing.Image]::FromFile("$src\$id.png")
  $w = 900; $h = [int]($img.Height * $w / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $w, $h)
  $bmp.Save("$out\$id.jpg", $codec, $prm)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}
```

## Skies

`assets/skies/` holds five of the eight collectible garden backdrops. The split
between painted and drawn is along a real line, not a budget line — though the
budget is how it was found. The free-trial generation allowance ran out after
five, and the three left over turned out to be the three that should have been
code all along:

| sky | source | why |
| --- | --- | --- |
| `dawn`, `morning`, `noon`, `rainy`, `dusk` | painted | Their character is **cloud structure** — soft irregular edges, wisps thinning to nothing, layered translucency. Views and gradients are genuinely bad at this; every attempt looks like lozenges. |
| `night`, `aurora`, `firstSun` | code | Their character is **light** — a starfield, drifting curtains of glow, a low sun bleeding along the horizon. Gradients and opacity are exactly right for that, and code wins something a painting cannot have: they move. |

So if the remaining generations are ever bought, think twice. A still aurora is
a green smear. `Garden.js` draws it as three rotated gradient bands that fade to
transparent at both ends and drift independently, over forty stars twinkling off
one shared driver.

Note that `aurora` was **darkened** in `calmData.js` when the curtains were
added (pale mint to a deep teal-navy). Bands of light over a daytime sky read as
coloured smudges; the whole effect depends on glow against darkness. It is also
in `NIGHT_SKIES` now, so the hills are lit to match.

Generated the same way as the habitats but at **21:9** — the sky strip is wide
and short (full width by ~154pt) — with a suffix that swaps the habitat's
"empty open ground across the lower third" for the opposite instruction:

```
Soft flat gouache illustration, muted desaturated palette, simple layered
shapes, minimal detail, gentle haze and atmospheric depth, calm and still.
Sky only, no ground, no horizon line, no trees, no buildings, no birds. The
lower edge fades to a soft plain even wash. No animals, no people, no text,
no letters. Children's picture book style, soft edges, no outlines, low
contrast, flat colour.
```

`The lower edge fades to a soft plain even wash` is the load-bearing line here:
that band is where the code-drawn plants stand, and any detail in it fights
them. `no horizon line` matters for the same reason — `Garden.js` draws its own
hills, and a painted horizon behind them gives the scene two.

Downscaled to **1000px wide, JPEG q82** — wider than the habitats because a sky
renders full-bleed rather than in a card. Smooth gradient art compresses far
better than the habitat scenes: all five together come to about **115 KB**.

Skies render in `Garden.js` under the palette gradient at 94% opacity, so a
trace of the app's own colour shows through and binds the bitmap to the theme.
When a painting is present the code clouds and the code sun are both suppressed
— the painting already has its own.

## Adding a seventh animal

Add it to `SPIRITS` and the quiz weights in `utils/spiritData.js`, add a scene to
the table above with the **unchanged** style suffix, downscale it into
`assets/spirits/`, and add the `require` to `utils/spiritArt.js`. `habitatFor`
falls back to the owl scene for an unknown id, so a missing file degrades to the
wrong picture rather than a crash.
