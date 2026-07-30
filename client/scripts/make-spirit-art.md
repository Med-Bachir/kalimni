# Spirit habitat art

The six backdrops in `assets/spirits/`. One per spirit animal, showing the place
that animal would go just to breathe — which is the last question the quiz asks
(`spirit.quiz.place` in i18n), so the reveal answers the question the patient
just answered.

These are the only bitmaps in the app. Everything else — the animals, the
garden, the UI sounds — is generated from code at runtime. The rule for reaching
for a bitmap is narrow: **only when code genuinely cannot do it.** Soft
atmospheric haze, a hundred layered trees receding into mist, light bleeding
along a horizon. Shape, depth and colour are not on that list; `Garden.js` does
those in Views and stays animatable.

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

## Adding a seventh animal

Add it to `SPIRITS` and the quiz weights in `utils/spiritData.js`, add a scene to
the table above with the **unchanged** style suffix, downscale it into
`assets/spirits/`, and add the `require` to `utils/spiritArt.js`. `habitatFor`
falls back to the owl scene for an unknown id, so a missing file degrades to the
wrong picture rather than a crash.
