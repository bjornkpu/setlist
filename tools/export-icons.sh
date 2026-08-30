#!/usr/bin/env bash
# Export PWA icon set from one 1024 master.
#   ./export.sh 01-slot-mark.svg app/assets/icons
set -euo pipefail
SRC="${1:?usage: export.sh <master.svg> [outdir]}"
OUT="${2:-icons}"
mkdir -p "$OUT"

for s in 16 32 48 180 192 512; do
  inkscape "$SRC" -o "$OUT/icon-${s}.png" -w "$s" -h "$s"
done

# Maskable: Android crops to a circle of 80% diameter, so the mark needs
# extra breathing room. These masters already sit inside the safe zone,
# but a maskable copy on a full-bleed background is still required.
inkscape "$SRC" -o "$OUT/icon-maskable-512.png" -w 512 -h 512

# Favicon: multi-resolution .ico
command -v magick >/dev/null && \
  magick "$OUT/icon-16.png" "$OUT/icon-32.png" "$OUT/icon-48.png" "$OUT/favicon.ico"

cp "$SRC" "$OUT/icon.svg"
echo "wrote $OUT"
