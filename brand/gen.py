import math, sys

S = 384.0
OX = OY = 64.0
BUBBLE_H = 0.84 * S
R, r = 0.30 * S, 0.09 * S
L = 0.325 * S                 # leaf square side
D = L * math.sqrt(2)          # the almond's visual width/height once rotated
W = 0.030 * S                 # spine thickness
TILT = -13                    # degrees, gives the leaf some life

cx = OX + S / 2
cy = OY + BUBBLE_H / 2

def rounded(x, y, w, h, tl, tr, br, bl):
    return (f"M {x+tl:.2f} {y:.2f} H {x+w-tr:.2f} A {tr:.2f} {tr:.2f} 0 0 1 {x+w:.2f} {y+tr:.2f} "
            f"V {y+h-br:.2f} A {br:.2f} {br:.2f} 0 0 1 {x+w-br:.2f} {y+h:.2f} "
            f"H {x+bl:.2f} A {bl:.2f} {bl:.2f} 0 0 1 {x:.2f} {y+h-bl:.2f} "
            f"V {y+tl:.2f} A {tl:.2f} {tl:.2f} 0 0 1 {x+tl:.2f} {y:.2f} Z")

bubble = rounded(OX, OY, S, BUBBLE_H, R, R, R, r)
leaf = rounded(cx - L/2, cy - L/2, L, L, L*0.877, L*0.123, L*0.877, L*0.123)

# Leaf spans cy-D/2 .. cy+D/2 vertically once rotated.
top = cy - D/2
vein  = (cx - W/2,        top + D*0.26, W,       D*0.46, W/2)
stem  = (cx - W*0.42,     top + D*0.66, W*0.84,  D*0.50, W*0.42)

seed_left, seed_top = OX + 0.045*S, OY + BUBBLE_H + 0.03*S
d1, d2, gap = 0.095*S, 0.055*S, 0.035*S
c1 = (seed_left + d1/2, seed_top + d1/2, d1/2)
c2 = (seed_left + d1 + gap + d2/2, seed_top + d1/2, d2/2)

def rect(t, fill):
    x, y, w, h, rx = t
    return f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{rx:.2f}" fill="{fill}"/>'

def svg(a, b, leaf_c, vein_c, dot_c, bg=None):
    back = f'<rect width="512" height="512" fill="{bg}"/>' if bg else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>
  {back}
  <path d="{bubble}" fill="url(#g)"/>
  <g transform="rotate({TILT} {cx:.2f} {cy:.2f})">
    <g transform="rotate(-45 {cx:.2f} {cy:.2f})"><path d="{leaf}" fill="{leaf_c}"/></g>
    {rect(stem, leaf_c)}
    {rect(vein, vein_c)}
  </g>
  <circle cx="{c1[0]:.2f}" cy="{c1[1]:.2f}" r="{c1[2]:.2f}" fill="{dot_c}"/>
  <circle cx="{c2[0]:.2f}" cy="{c2[1]:.2f}" r="{c2[2]:.2f}" fill="{dot_c}" opacity="0.7"/>
</svg>
'''

open('brand/kalimni-logo.svg','w').write(svg('#29627E','#1C4A61','#FFFFFF','rgba(41,98,126,.42)','#29627E'))
open('brand/kalimni-logo-on-brand.svg','w').write(svg('#FFFFFF','#EAF3F7','#29627E','rgba(255,255,255,.55)','#FFFFFF','#29627E'))
open('brand/kalimni-icon.svg','w').write(svg('#29627E','#1C4A61','#FFFFFF','rgba(41,98,126,.42)','#29627E','#F6FAFC'))
print(f"L={L:.1f} D={D:.1f} W={W:.1f} tilt={TILT}")
