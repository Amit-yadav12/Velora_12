#!/usr/bin/env bash
# Velora brand assets — regenerate the raster app icons + social card.
#
# The mark is the supplied Velora "V": a dimensional ribbon with a mint→teal
# gradient, glossy specular highlight and an indigo/violet ambient glow on deep
# navy. Everything here is deterministic: same script → same files, so the
# assets in public/ are reproducible and reviewable rather than mystery blobs.
#
#   bash scripts/brand/make-assets.sh
#
# Requires ImageMagick 6 (`convert`) and the Inter font files in
# scripts/brand/fonts (SIL OFL 1.1 — see fonts/OFL.txt).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FONT="$ROOT/scripts/brand/fonts"
OUT="$ROOT/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# 1. The V mark on transparent white — used both as colour mask and glow source
# ---------------------------------------------------------------------------
# Drawn at 4x the largest icon so the round caps stay clean when downscaled.
S=2048
V_PATH="M 640,600 L 1024,1420 M 1024,1420 L 1408,600"

convert -size ${S}x${S} xc:none \
  -fill none -stroke white -strokewidth 250 \
  -draw "stroke-linecap round stroke-linejoin round path '$V_PATH'" \
  "$TMP/v-mask.png"

# Ribbon colour: mint at the top right, deep teal at the vertex, aqua at the
# left shoulder — the gradient follows the reference logo's light direction.
convert -size ${S}x${S} gradient:'#8FF3D2-#0E9E92' \
  -rotate 24 -gravity center -extent ${S}x${S} "$TMP/v-color.png"
convert "$TMP/v-color.png" "$TMP/v-mask.png" -alpha off -compose CopyOpacity -composite "$TMP/v-mark.png"

# Ribbon fold: a soft shadow on the inner (left) face of each stroke gives the
# flat V the crease the reference logo has.
convert -size ${S}x${S} xc:none \
  -fill '#0B3B36' -stroke none \
  -draw "polygon 880,600 1024,1420 1150,1420 950,600" \
  -blur 0x40 "$TMP/v-fold-src.png"
convert "$TMP/v-mark.png" "$TMP/v-fold-src.png" -compose DstIn -composite "$TMP/v-fold.png"
convert "$TMP/v-mark.png" "$TMP/v-fold.png" -compose over -composite "$TMP/v-mark.png"

# Glow = the same silhouette, blurred and tinted teal.
convert "$TMP/v-mask.png" -blur 0x70 -fill '#2BE8C0' -colorize 100 "$TMP/v-glow.png"
convert "$TMP/v-glow.png" -alpha set -channel A -evaluate multiply 0.55 +channel "$TMP/v-glow.png"

# Specular: a soft white highlight riding the upper-left of each stroke.
convert -size ${S}x${S} radial-gradient:'#FFFFFF80-#FFFFFF00' \
  -geometry +0+0 -gravity northwest -crop ${S}x${S}+0+0 +repage "$TMP/spec-soft.png"
convert "$TMP/v-mask.png" "$TMP/spec-soft.png" -compose DstIn -composite "$TMP/v-spec.png"

# ---------------------------------------------------------------------------
# 2. Icon tile — deep navy with indigo / violet / teal ambient light
# ---------------------------------------------------------------------------
# Ambient light is blended with `screen` against black-ended radials, so the
# light fades to nothing at its own edges instead of leaving a visible seam.
tile() {
  local s=$1 out=$2
  convert -size ${s}x${s} xc:'#06070F' \
    \( -size ${s}x${s} radial-gradient:'#4C3FE0-#000000' \) \
      -geometry "-$((s / 3))-$((s / 4))" -compose screen -composite \
    \( -size ${s}x${s} radial-gradient:'#6D28D9-#000000' \) \
      -geometry "+$((s / 3))+$((s / 2))" -compose screen -composite \
    \( -size ${s}x${s} radial-gradient:'#0E9E92-#000000' \) \
      -geometry "+$((s / 8))+$((s / 2))" -compose screen -composite \
    "$out"
}

# ---------------------------------------------------------------------------
# 3. Compose: tile → glow → mark → specular, with a maskable-safe inner field
# ---------------------------------------------------------------------------
render_icon() {
  local s=$1 out=$2
  local mark=$((s * 62 / 100))
  convert "$TMP/tile-$s.png" \
    \( "$TMP/v-glow.png" -resize ${mark}x${mark} \) -gravity center -geometry +0+0 -compose over -composite \
    \( "$TMP/v-mark.png" -resize ${mark}x${mark} \) -gravity center -geometry +0+0 -compose over -composite \
    \( "$TMP/v-spec.png" -resize ${mark}x${mark} \) -gravity center -geometry +0+0 -compose over -composite \
    "$out"
}

for s in 1024 512 192; do tile "$s" "$TMP/tile-$s.png"; done
render_icon 512 "$OUT/icon-512.png"
render_icon 192 "$OUT/icon-192.png"

# Apple touch icon (180) and a 1024 master for stores/social avatars.
render_icon 1024 "$TMP/icon-1024.png"
convert "$TMP/icon-1024.png" -resize 180x180 "$OUT/apple-touch-icon.png"

# ---------------------------------------------------------------------------
# 4. Social card — 1200x630 (the size the OG/Twitter meta tags declare)
# ---------------------------------------------------------------------------
W=1200; H=630
# Ambient light: gradient canvases the size of the card (so the falloff reaches
# zero inside the frame) blended with `screen`. Sizes must match the canvas —
# a 630x630 gradient stamped onto a 1200px canvas leaves a hard vertical seam.
convert -size ${W}x${H} xc:'#05060C' \
  \( -size ${W}x${H} radial-gradient:'#3A31B0-#000000' \) -compose screen -composite \
  \( -size 700x700 radial-gradient:'#5B21B6-#000000' \) -geometry +620+60 -compose screen -composite \
  \( -size 900x900 radial-gradient:'#0B7A74-#000000' \) -geometry +220+300 -compose screen -composite \
  "$TMP/og-bg.png"

# Strapline uses DejaVu (has the ₹ glyph — Inter's latin subset does not).
STRAIGHT_FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf

convert "$TMP/og-bg.png" \
  \( "$TMP/v-glow.png" -resize 320x320 \) -geometry +830+150 -compose over -composite \
  \( "$TMP/v-mark.png" -resize 320x320 \) -geometry +830+150 -compose over -composite \
  \( "$TMP/v-spec.png" -resize 320x320 \) -geometry +830+150 -compose over -composite \
  -font "$FONT/Inter-600.ttf" -fill '#A5B4FC' -pointsize 24 -kerning 7 \
  -annotate +90+132 'VELORA' \
  -font "$FONT/Inter-700.ttf" -fill '#FFFFFF' -pointsize 76 -kerning -1 \
  -annotate +86+262 'Book anything,' \
  -font "$FONT/Inter-700.ttf" -fill '#5EF2D0' -pointsize 76 -kerning -1 \
  -annotate +86+352 'instantly.' \
  -font "$STRAIGHT_FONT" -fill '#9AA7BC' -pointsize 25 \
  -annotate +90+428 'Real availability  ·  signed QR tickets  ·  ₹ pricing  ·  16 cities' \
  -font "$STRAIGHT_FONT" -fill '#6B7A90' -pointsize 21 \
  -annotate +90+492 'Discover → compare → book → verify at the door' \
  "$OUT/og-image.png"

# Keep the PNGs small — these ship on every page load.
for f in icon-192.png icon-512.png apple-touch-icon.png og-image.png; do
  convert "$OUT/$f" -strip -define png:compression-level=9 "$OUT/$f"
done
convert "$OUT/icon-512.png" -colors 256 -strip "$OUT/icon-512.png"
convert "$OUT/og-image.png" -colors 256 -strip "$OUT/og-image.png"

# ---------------------------------------------------------------------------
# 5. Report
# ---------------------------------------------------------------------------
for f in icon-192.png icon-512.png apple-touch-icon.png og-image.png; do
  identify -format "%f  %wx%h  %b\n" "$OUT/$f"
done
