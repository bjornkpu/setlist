# Phase 5: Service Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app shell starts with no network; schedules come from IndexedDB offline; the app is installable — build order step 5 of `docs/REQUIREMENTS.md` §8, spec §5.5.

**Architecture:** `app/sw.js` precaches an explicit shell list (manually bumped `VERSION`, cache-first), serves navigations from the cached shell so `?url=`/`?at=` links work offline, and passes every non-shell request (schedule/provider JSON, cross-origin) to the network — IndexedDB is their offline store, never the HTTP cache. A node test keeps the manual precache list honest against the files on disk (the phase-4 review's named omission risk). A minimal `manifest.json` + SVG icon make it installable on the Android/Chromium target.

**Tech Stack:** Plain JS, Service Worker API, Web App Manifest. No build, no dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-setlist-design.md` (Offline & providers section; `docs/REQUIREMENTS.md` §5.5)

## Global Constraints

- Cache-first for the precached shell ONLY. Schedule and provider fetches are network-only from the SW's perspective — never HTTP-cached (offline availability is IndexedDB's job, spec).
- Navigations (`request.mode === "navigate"`) serve the cached `index.html` regardless of query string, falling back to network — shared `?url=` links (Skedz convention) and `?at=` QA links must work offline.
- `skipWaiting` + `clients.claim`; old caches deleted on activate. `VERSION` is bumped manually whenever a shell file changes (comment in sw.js says so).
- Every `.js/.css/.html/.json/.svg` file under `app/` except `sw.js` itself must be in the precache list — enforced by a node test, not convention.
- SW registration must never break the app where unavailable (plain http, private mode): `.catch` and move on.
- Non-GET requests untouched. Cross-origin requests untouched (default browser handling).
- Test command: `node --test tests/`. Commits: Conventional Commits, subject ≤ 50 chars.

---

### Task 1: Manifest + icon

**Files:**
- Create: `app/manifest.json`
- Create: `app/icon.svg`
- Modify: `app/index.html` (two head lines)

**Interfaces:**
- Produces: installable PWA metadata; both files enter Task 2's precache list.

- [ ] **Step 1: Create `app/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#0a7a44"/>
  <text x="50" y="68" font-family="system-ui, sans-serif" font-size="52" font-weight="800" fill="#fff" text-anchor="middle">S</text>
</svg>
```

- [ ] **Step 2: Create `app/manifest.json`**

```json
{
  "name": "setlist",
  "short_name": "setlist",
  "description": "Where do I go next? A conference companion.",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0a7a44",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: Add to `app/index.html`'s `<head>`, after the stylesheet link**

```html
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#0a7a44">
```

- [ ] **Step 4: Commit**

```bash
git add app/manifest.json app/icon.svg app/index.html
git commit -m "feat: web app manifest and icon"
```

---

### Task 2: Service worker + honest-precache test + registration (TDD)

**Files:**
- Create: `app/sw.js`
- Modify: `app/js/main.js` (registration at the bottom)
- Test: `tests/sw.test.js`

**Interfaces:**
- Consumes: the complete `app/` file tree (Task 1 included).
- Produces: offline shell. `SHELL` array in sw.js is the single precache list.

- [ ] **Step 1: Write the failing test**

Create `tests/sw.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appDir = new URL("../app/", import.meta.url);

test("sw precache list matches the app shell on disk", async () => {
  const sw = await readFile(new URL("sw.js", appDir), "utf8");
  const block = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const entries = [...block.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]);
  assert.ok(entries.includes(""), 'SHELL must contain "./" (the navigation root)');
  const shell = entries.filter(Boolean).sort();
  const disk = (await readdir(fileURLToPath(appDir), { recursive: true }))
    .map((f) => String(f).replaceAll("\\", "/"))
    .filter((f) => /\.(js|css|html|json|svg)$/.test(f) && f !== "sw.js")
    .sort();
  assert.deepEqual(shell, disk); // both directions: nothing missing, nothing phantom
});
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `node --test tests/`
Expected: sw test FAILS (sw.js missing); other 40 pass.

- [ ] **Step 3: Create `app/sw.js`**

```js
// Service worker: offline app shell (spec 5.5).
// Cache-first for the precached SHELL only; schedules and providers always go
// to the network — IndexedDB is their offline store, never the HTTP cache.
// Bump VERSION whenever any file in SHELL changes; tests/sw.test.js keeps the
// list itself honest against the files on disk.
const VERSION = "setlist-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/app.css",
  "./js/actions.js",
  "./js/clock.js",
  "./js/db.js",
  "./js/filter.js",
  "./js/glance.js",
  "./js/html.js",
  "./js/main.js",
  "./js/plan.js",
  "./js/schedule.js",
  "./js/settings.js",
  "./js/store.js",
  "./js/toast.js",
  "./js/views/browse.js",
  "./js/views/event.js",
  "./js/views/glance.js",
  "./js/views/slot.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    // ?url= and ?at= links must work offline: serve the shell, app JS does the rest
    event.respondWith(caches.match("./index.html").then((hit) => hit ?? fetch(request)));
    return;
  }
  if (new URL(request.url).origin === location.origin) {
    // shell files hit the cache; anything else same-origin (e.g. a schedule
    // under /conferences/) misses and falls through to the network, uncached
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? fetch(request)),
    );
  }
  // cross-origin: default handling
});
```

- [ ] **Step 4: Register in `app/js/main.js`** (append at the very bottom)

```js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // no SW available (plain http, private mode): the app still works online
  });
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `node --test tests/`
Expected: all PASS (41)

- [ ] **Step 6: Syntax + smoke**

```bash
node --check app/sw.js && node --check app/js/main.js && echo SYNTAX-OK
```

HTTP smoke: serve repo root (`uv run python -m http.server 8123`), curl `app/sw.js`, `app/manifest.json`, `app/icon.svg` → 200 each, kill server.

- [ ] **Step 7: Commit**

```bash
git add app/sw.js app/js/main.js tests/sw.test.js
git commit -m "feat: offline shell via service worker"
```

---

## Manual QA (after all tasks — human, real browser; DevTools → Application)

Serve repo root, open `http://localhost:8123/app/?url=/conferences/fagfestival-2026.json`:

1. Application → Service Workers: `setlist-v1` active. Cache Storage: all shell files present, NO `/conferences/…` entries.
2. DevTools → Network → Offline → reload: app boots from cache, schedule appears from IndexedDB, glance works.
3. Still offline, open `http://localhost:8123/app/?url=/conferences/fagfestival-2026.json&at=2026-08-26T11:30:00%2B02:00` in a new tab: shell loads (navigate → cached index.html); the `?url=` fetch fails, the cached schedule auto-restores, and the failure message appears as a toast over the glance.
4. Back online: edit nothing, reload — still `setlist-v1`, no re-download storm.
5. Address-bar install icon (or menu → Install app) appears; installed app opens standalone to the glance.
6. Every screen except adding a NEW schedule works offline (§5.5).
