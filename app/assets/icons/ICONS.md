# setlist — icon drawing rules

> The app renders these inline from `app/js/icons.js` (needed for
> currentColor). `tests/icons.test.js` fails if the two drift — after editing
> an svg here, paste the same body into `icons.js`.

Read this before creating or editing any file in `assets/icons/`.
These are hard constraints, not suggestions. If a shape cannot be built
within them, the concept is wrong — pick a simpler metaphor instead of
bending the rules.

## Canvas

- `viewBox="0 0 24 24"`. Never any other size.
- Live area is 2–22. Nothing touches the outer 2px on any side.
- Optical centre, not mathematical centre. A downward-pointing shape
  sits ~0.5px high.

## Geometry

- **Every coordinate is a multiple of 0.5.** No `11.734`. If the maths
  gives you a fraction, move the point, don't keep the fraction.
- Circles: radius from {2, 3, 4, 5, 8, 9} only, centred on whole numbers.
- Corner radii: 1, 2, or 3. One value per icon — never mix.
- Angles: 0°, 45°, or 90°. Diagonals run at exactly 45° (equal dx and dy).
- Max 6 path commands per `<path>`. Max 5 elements per icon. If you need
  more, the icon is too detailed.
- No `C` curves unless the shape is genuinely organic (a pin, a cloud).
  Prefer `A` arcs with explicit radii, or straight `L` segments.

## Stroke

- Stroke-only. **No fills** except `fill="none"` on the root.
- `stroke="currentColor"`, `stroke-width="1.5"`,
  `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Set these once on the root `<svg>`, never per element.
- Minimum gap between two strokes is 2px. Anything tighter fills in at
  16px and reads as a smudge.

## Content

- One idea per icon. A "download for offline" icon is an arrow and a
  tray — not an arrow, a tray, a cloud, and a wifi symbol.
- No text, no numbers, no gradients, no shadows, no opacity.
- Metaphors come from the domain: slots, rooms, tracks, time.

## Output

- No `<title>`, no `id`, no `class`, no XML declaration, no editor
  metadata. The file starts with `<svg` and ends with `</svg>`.
- Filenames are lowercase kebab-case matching the concept: `pick.svg`.

## Verification loop — required

After writing an icon you have not seen it. Render and look before
claiming it works:

    inkscape icon.svg -o /tmp/check-16.png -w 16 -h 16
    inkscape icon.svg -o /tmp/check-24.png -w 24 -h 24
    inkscape icon.svg -o /tmp/check-96.png -w 96 -h 96

Read all three back. The 16px render is the one that decides: if the
silhouette is not identifiable there, the icon is rejected regardless of
how it looks at 96.

## Checklist before commit

- [ ] Every coordinate lands on a 0.5 grid
- [ ] 5 elements or fewer
- [ ] Legible at 16px
- [ ] Distinct in silhouette from every other icon in the set
- [ ] Stroke attributes on the root only
