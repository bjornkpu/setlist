// Service worker: offline app shell (spec 5.5).
// Cache-first for the precached SHELL only; schedules and providers always go
// to the network — IndexedDB is their offline store, never the HTTP cache.
// Bump VERSION whenever any file in SHELL changes; tests/sw.test.js keeps the
// list itself honest against the files on disk.
const VERSION = "setlist-856522bf";
const SHELL = [
  // "./" pairs with the entries.includes("") assertion in tests/sw.test.js — remove both together
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
  "./js/providers.js",
  "./js/schedule.js",
  "./js/settings.js",
  "./js/store.js",
  "./js/toast.js",
  "./js/views/browse.js",
  "./js/views/event.js",
  "./js/views/glance.js",
  "./js/views/library.js",
  "./js/views/slot.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((e) => {
        console.error("SW precache failed", e);
        throw e;
      }),
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
    event.respondWith(
      caches.open(VERSION).then((c) => c.match("./index.html")).then((hit) => hit ?? fetch(request)),
    );
    return;
  }
  if (new URL(request.url).origin === location.origin) {
    // shell files hit the cache; anything else same-origin (e.g. a schedule
    // under /conferences/) misses and falls through to the network, uncached
    event.respondWith(
      caches
        .open(VERSION)
        .then((c) => c.match(request, { ignoreSearch: true }))
        .then((hit) => hit ?? fetch(request)),
    );
  }
  // cross-origin: default handling
});
