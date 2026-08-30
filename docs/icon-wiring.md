> Applied 2026-08-30 (manifest.json, index.html, sw shell). Kept for the rationale; the live wiring in app/ is authoritative — one deliberate deviation: the icon SVGs ARE in the SW shell, because tests/sw.test.js requires every svg under app/ to be precached.

# Wiring the icons into setlist

## `app/manifest.webmanifest`

```json
{
  "name": "setlist",
  "short_name": "setlist",
  "description": "Where do I go next?",
  "start_url": "/setlist/app/",
  "scope": "/setlist/app/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a7a44",
  "theme_color": "#0a7a44",
  "icons": [
    { "src": "assets/icons/icon.svg",              "sizes": "any",   "type": "image/svg+xml" },
    { "src": "assets/icons/icon-192.png",          "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512.png",          "sizes": "512x512", "type": "image/png" },
    { "src": "assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Keep `start_url` and `scope` with the trailing slash — same reason the
README gives for the app link.

## `app/index.html` head

```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/icons/favicon.ico" sizes="32x32">
<link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/icons/icon-180.png">
<meta name="theme-color" content="#0a7a44">
```

iOS ignores the manifest for the home-screen image and uses
`apple-touch-icon` only. It also does not honour transparency, which is why
these masters carry their own background rect rather than relying on one.

## Service worker

`app/sw.js` caches the app shell, and `tests/sw.test.js` hashes those files
against `VERSION`. Decide deliberately whether icons join the shell:

- **In the shell** — icons work offline on first launch, but every icon
  tweak forces a `VERSION` bump and a full shell re-download.
- **Out of the shell** — icons are fetched once at install time by the OS
  and cached there; the shell hash stays stable.

Out is probably right here. The OS reads the icon at install, not at
runtime, so shell-caching buys little.

## Safe zone

All ten masters keep their mark inside a centred circle of 80% diameter,
which is the maskable safe zone. Android's various crops (circle, squircle,
rounded square) will not clip them.
