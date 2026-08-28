# Phase 2: Browse View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load a frab schedule from a URL (or file), render the full program grouped by day with filters and a session detail view — build order step 2 of `docs/REQUIREMENTS.md` §8. No persistence yet.

**Architecture:** Hash-routed view modules per the spec: pure DOM-free logic modules (`schedule.js` normalize, `filter.js`) tested with `node --test`, plus an app shell (`index.html`, `main.js` router/loader) and two view render functions (`browse`, `event`) rendering template strings into `#app`. In-memory state only; a page reload loses the schedule (phase 3 adds IndexedDB).

**Tech Stack:** Plain HTML/CSS/JS, native ES modules, no framework, no build step, no dependencies. Node ≥ 18 (v26 installed) runs the tests directly.

**Spec:** `docs/superpowers/specs/2026-08-28-setlist-design.md` (and `docs/REQUIREMENTS.md` §3, §4.1, §4.3, §5.2)

## Global Constraints

- No build step, no bundler, no framework, no npm dependencies. Native ES modules only (`<script type="module">`).
- All schedule-sourced text is HTML-escaped before hitting `innerHTML` (the `esc` helper in `app/js/html.js`).
- Logic modules (`schedule.js`, `filter.js`) are DOM-free so node runs them directly.
- Events with missing optional fields (empty `persons`, empty `abstract`, anchor events) must render, never be filtered out (REQUIREMENTS §4.3).
- UI chrome text is English. Schedule content renders verbatim.
- Test command, from repo root: `node --test tests/`
- Commits: Conventional Commits, subject ≤ 50 chars, English.
- Routes claimed in this phase: `#/browse` (program), `#/event/:key` (detail). The bare `#/` route also shows browse for now — phase 4 will claim it for the glance view; do not hardcode anything that assumes `#/` is browse forever.
- Phone-first layout: single column, no horizontal scroll, tap targets ≥ 40px tall.

---

### Task 1: `schedule.js` — normalize frab JSON (TDD)

**Files:**
- Create: `package.json` (repo root)
- Create: `app/js/schedule.js`
- Test: `tests/schedule.test.js`

**Interfaces:**
- Produces (used by Tasks 2–3 and later phases):
  - `normalize(root) -> model` where model = `{title, start, end, days: [{index, date, dayStart, dayEnd, events: [event]}], rooms: [string], tracks: [string]}`; throws `Error(/frab/)` on non-frab input.
  - event = `{key, dayIndex, start, end, startLabel, endLabel, room, title, subtitle, track, type, language, persons: [string], abstract, description, links: []}` — `key` is `String(guid ?? id)`, `start`/`end` epoch ms, `startLabel`/`endLabel` are `HH:MM` display strings. Day events sorted by `start`, tie-broken by room name. Missing optional fields become `""`/`[]`.
  - `addDuration(startHM, durationHM) -> "HH:MM"` (wraps past midnight).

- [ ] **Step 1: Create `package.json`** (needed so node treats `.js` as ES modules)

```json
{
  "name": "setlist",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/schedule.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalize, addDuration } from "../app/js/schedule.js";

test("addDuration adds HH:MM durations", () => {
  assert.equal(addDuration("11:10", "00:50"), "12:00");
  assert.equal(addDuration("23:30", "01:00"), "00:30");
  assert.equal(addDuration("09:00", "01:00"), "10:00");
});

function fixture() {
  return {
    schedule: {
      conference: {
        title: "Test Conf",
        start: "2026-08-26",
        end: "2026-08-26",
        days: [
          {
            index: 0,
            date: "2026-08-26",
            day_start: "2026-08-26T08:00:00+02:00",
            day_end: "2026-08-26T18:00:00+02:00",
            rooms: {
              "Sal 1": [
                {
                  guid: "g1", id: 1, date: "2026-08-26T10:00:00+02:00",
                  start: "10:00", duration: "00:50", room: "Sal 1",
                  title: "B talk", track: "Spor 1",
                  persons: [{ id: 1, public_name: "Kari" }], abstract: "Om ting",
                },
                {
                  id: 2, date: "2026-08-26T09:00:00+02:00",
                  start: "09:00", duration: "00:50", room: "Sal 1", title: "A talk",
                },
              ],
              Fellesareal: [
                {
                  guid: "g3", id: 3, date: "2026-08-26T12:00:00+02:00",
                  start: "12:00", duration: "00:50", room: "Fellesareal", title: "Lunsj",
                },
              ],
            },
          },
        ],
      },
    },
  };
}

test("normalize builds sorted day events with defaults", () => {
  const m = normalize(fixture());
  assert.equal(m.title, "Test Conf");
  assert.equal(m.days.length, 1);
  const evs = m.days[0].events;
  assert.deepEqual(evs.map((e) => e.key), ["2", "g1", "g3"]); // start order; id fallback for key
  const b = evs[1];
  assert.equal(b.endLabel, "10:50");
  assert.equal(b.end - b.start, 50 * 60000);
  assert.deepEqual(b.persons, ["Kari"]);
  const anchor = evs[2];
  assert.deepEqual(anchor.persons, []); // missing persons -> []
  assert.equal(anchor.abstract, "");    // missing abstract -> ""
  assert.deepEqual(m.rooms, ["Sal 1", "Fellesareal"]);
  assert.deepEqual(m.tracks, ["Spor 1"]);
});

test("normalize skips junk events and tolerates junk room values", () => {
  const f = fixture();
  f.schedule.conference.days[0].rooms["Sal 1"].push("junk", null);
  f.schedule.conference.days[0].rooms["Broken"] = "not a list";
  const m = normalize(f);
  assert.equal(m.days[0].events.length, 3);
});

test("normalize rejects non-frab JSON", () => {
  assert.throws(() => normalize({ foo: 1 }), /frab/);
});

test("normalize handles the real Fagfestival schedule", async () => {
  const root = JSON.parse(
    await readFile(new URL("../conferences/fagfestival-2026.json", import.meta.url), "utf8"),
  );
  const m = normalize(root);
  assert.equal(m.days.length, 1);
  assert.equal(m.days[0].events.length, 48);
  assert.equal(m.rooms.length, 7);
  assert.equal(m.tracks.length, 6);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — cannot find module `../app/js/schedule.js`

- [ ] **Step 4: Write the implementation**

Create `app/js/schedule.js`:

```js
// frab schedule.json -> normalized model. Pure; no DOM. Terms: CONTEXT.md.

const HHMM = /^\d{1,2}:\d{2}$/;

export function addDuration(start, duration) {
  const [sh, sm] = start.split(":").map(Number);
  const [dh, dm] = duration.split(":").map(Number);
  const total = (sh * 60 + sm + dh * 60 + dm) % (24 * 60);
  const h = String(Math.trunc(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function normalize(root) {
  const conf = root?.schedule?.conference;
  if (!conf || typeof conf !== "object") {
    throw new Error("Not a frab schedule.json: missing schedule.conference");
  }
  const rooms = [];
  const tracks = new Set();
  const days = (Array.isArray(conf.days) ? conf.days : []).map((day, di) => {
    const events = [];
    for (const [room, list] of Object.entries(day?.rooms ?? {})) {
      if (!rooms.includes(room)) rooms.push(room);
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const ev = normalizeEvent(raw, room, di);
        if (ev) events.push(ev);
      }
    }
    events.sort((a, b) => a.start - b.start || a.room.localeCompare(b.room));
    for (const ev of events) if (ev.track) tracks.add(ev.track);
    return {
      index: day?.index ?? di,
      date: day?.date ?? "",
      dayStart: day?.day_start ?? "",
      dayEnd: day?.day_end ?? "",
      events,
    };
  });
  return {
    title: conf.title ?? "",
    start: conf.start ?? "",
    end: conf.end ?? "",
    days,
    rooms,
    tracks: [...tracks].sort((a, b) => a.localeCompare(b)),
  };
}

function normalizeEvent(raw, room, dayIndex) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const key = String(raw.guid ?? raw.id ?? "");
  if (!key) return null;
  const parsed = Date.parse(raw.date ?? "");
  const start = Number.isNaN(parsed) ? 0 : parsed;
  const duration = HHMM.test(raw.duration ?? "") ? raw.duration : "00:00";
  const [dh, dm] = duration.split(":").map(Number);
  const startLabel = HHMM.test(raw.start ?? "") ? raw.start : "";
  return {
    key,
    dayIndex,
    start,
    end: start + (dh * 60 + dm) * 60000,
    startLabel,
    endLabel: startLabel ? addDuration(startLabel, duration) : "",
    room,
    title: raw.title ?? "",
    subtitle: raw.subtitle ?? "",
    track: raw.track ?? "",
    type: raw.type ?? "",
    language: raw.language ?? "",
    persons: (Array.isArray(raw.persons) ? raw.persons : [])
      .map((p) => p?.public_name ?? "")
      .filter(Boolean),
    abstract: raw.abstract ?? "",
    description: raw.description ?? "",
    links: Array.isArray(raw.links) ? raw.links : [],
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add package.json app/js/schedule.js tests/schedule.test.js
git commit -m "feat: normalize frab schedules to app model"
```

---

### Task 2: `filter.js` — browse filtering (TDD)

**Files:**
- Create: `app/js/filter.js`
- Test: `tests/filter.test.js`

**Interfaces:**
- Consumes: normalized events from Task 1 (`room`, `track`, `title`, `persons`, `abstract` fields)
- Produces: `filterEvents(events, {room = "", track = "", q = ""}) -> events` — empty/omitted filter matches everything; `q` is case-insensitive substring over title, person names, abstract.

- [ ] **Step 1: Write the failing tests**

Create `tests/filter.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { filterEvents } from "../app/js/filter.js";

const evs = [
  { room: "Sal 1", track: "Spor 1", title: "Copilot i praksis", persons: ["Kjetil Gullen"], abstract: "Agent-bygging" },
  { room: "Sal 2", track: "Spor 2", title: "Sikker kode", persons: ["Kari"], abstract: "" },
  { room: "Fellesareal", track: "", title: "Lunsj", persons: [], abstract: "" },
];

test("no filters returns everything", () => {
  assert.equal(filterEvents(evs, {}).length, 3);
  assert.equal(filterEvents(evs).length, 3);
});

test("room filter", () => {
  assert.deepEqual(filterEvents(evs, { room: "Sal 2" }).map((e) => e.title), ["Sikker kode"]);
});

test("track filter", () => {
  assert.deepEqual(filterEvents(evs, { track: "Spor 1" }).map((e) => e.title), ["Copilot i praksis"]);
});

test("search matches title, speaker, abstract, case-insensitively", () => {
  assert.equal(filterEvents(evs, { q: "copilot" }).length, 1);
  assert.equal(filterEvents(evs, { q: "gullen" }).length, 1);
  assert.equal(filterEvents(evs, { q: "agent" }).length, 1);
  assert.equal(filterEvents(evs, { q: "  " }).length, 3);
  assert.equal(filterEvents(evs, { q: "zzz" }).length, 0);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/`
Expected: filter tests FAIL (module not found); schedule tests still pass.

- [ ] **Step 3: Write the implementation**

Create `app/js/filter.js`:

```js
// Browse-view filtering. Pure; no DOM.

export function filterEvents(events, { room = "", track = "", q = "" } = {}) {
  const needle = q.trim().toLowerCase();
  return events.filter(
    (e) =>
      (!room || e.room === room) &&
      (!track || e.track === track) &&
      (!needle ||
        e.title.toLowerCase().includes(needle) ||
        e.persons.some((p) => p.toLowerCase().includes(needle)) ||
        e.abstract.toLowerCase().includes(needle)),
  );
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/js/filter.js tests/filter.test.js
git commit -m "feat: add browse filtering"
```

---

### Task 3: App shell, browse view, event detail

**Files:**
- Create: `app/index.html`
- Create: `app/css/app.css`
- Create: `app/js/html.js`
- Create: `app/js/main.js`
- Create: `app/js/views/browse.js`
- Create: `app/js/views/event.js`

**Interfaces:**
- Consumes: `normalize` (Task 1), `filterEvents` (Task 2)
- Produces: running app. `state` shape (module-level in `main.js`): `{model, sourceUrl, browse: {dayIndex, room, track, q}}`. Views export `renderBrowse(app, state)` / `renderEvent(app, state, key)` and render into the `#app` element. Later phases add routes and persistence around this shell.

No unit tests for this task (DOM code; spec decision: UI verified by hand). Verification = syntax checks + HTTP smoke + the reviewer.

- [ ] **Step 1: Create `app/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>setlist</title>
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `app/js/html.js`**

```js
// HTML-escape all schedule-sourced text before innerHTML.

const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => MAP[c]);
```

- [ ] **Step 3: Create `app/js/main.js`**

```js
import { normalize } from "./schedule.js";
import { renderBrowse } from "./views/browse.js";
import { renderEvent } from "./views/event.js";
import { esc } from "./html.js";

const app = document.getElementById("app");

export const state = {
  model: null,
  sourceUrl: "",
  browse: { dayIndex: 0, room: "", track: "", q: "" },
};

function defaultDayIndex(model) {
  const today = new Date().toLocaleDateString("sv-SE"); // sv-SE = YYYY-MM-DD, local time
  const i = model.days.findIndex((d) => d.date === today);
  return i === -1 ? 0 : i;
}

function activate(model, sourceUrl) {
  state.model = model;
  state.sourceUrl = sourceUrl;
  state.browse = { dayIndex: defaultDayIndex(model), room: "", track: "", q: "" };
  location.hash = "#/browse";
  route();
}

async function loadSchedule(url) {
  app.innerHTML = `<p class="status pad">Loading…</p>`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    renderLoadScreen(
      `Could not fetch ${url}. The host may block browser requests (CORS), or you are offline. You can import the file instead.`,
    );
    return;
  }
  if (!res.ok) {
    renderLoadScreen(`Could not load ${url}: HTTP ${res.status}.`);
    return;
  }
  let json;
  try {
    json = await res.json();
  } catch {
    renderLoadScreen(`${url} is not valid JSON.`);
    return;
  }
  try {
    activate(normalize(json), url);
  } catch (e) {
    renderLoadScreen(`${url}: ${e.message}`);
    return;
  }
  // strip ?url= after a successful load so reload/share links stay clean
  if (new URLSearchParams(location.search).has("url")) {
    history.replaceState(null, "", location.pathname + location.hash);
  }
}

function renderLoadScreen(error = "") {
  app.innerHTML = `
    <div class="pad">
      <h1>setlist</h1>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <form id="load-form">
        <label for="load-url">Load a schedule by URL</label>
        <input id="load-url" name="url" type="url" placeholder="https://…/schedule.json" required>
        <button type="submit">Load</button>
      </form>
      <p class="or"><label>…or import a schedule.json file
        <input type="file" id="file-import" accept=".json,application/json">
      </label></p>
    </div>`;
  document.getElementById("load-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadSchedule(new FormData(e.target).get("url"));
  });
  document.getElementById("file-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      activate(normalize(JSON.parse(await file.text())), file.name);
    } catch (err) {
      renderLoadScreen(`Import failed: ${err.message}`);
    }
  });
}

function route() {
  if (!state.model) {
    renderLoadScreen();
    return;
  }
  const hash = location.hash || "#/browse";
  const evMatch = hash.match(/^#\/event\/(.+)$/);
  if (evMatch) {
    renderEvent(app, state, decodeURIComponent(evMatch[1]));
  } else {
    renderBrowse(app, state); // #/browse and, for now, everything else
  }
}

window.addEventListener("hashchange", route);

const startUrl = new URLSearchParams(location.search).get("url");
if (startUrl) {
  loadSchedule(startUrl);
} else {
  route();
}
```

- [ ] **Step 4: Create `app/js/views/browse.js`**

```js
import { esc } from "../html.js";
import { filterEvents } from "../filter.js";

export function renderBrowse(app, state) {
  const { model, browse } = state;
  const day = model.days[browse.dayIndex] ?? model.days[0];
  app.innerHTML = `
    <header class="bar"><h1>${esc(model.title)}</h1></header>
    ${model.days.length > 1 ? daySelector(model, browse) : ""}
    <div class="filters">
      ${select("room", "All rooms", model.rooms, browse.room)}
      ${model.tracks.length ? select("track", "All tracks", model.tracks, browse.track) : ""}
      <input type="search" id="q" placeholder="Search" value="${esc(browse.q)}">
    </div>
    <ul class="events">${list(day, browse)}</ul>`;
  wire(app, state);
}

function list(day, browse) {
  const events = filterEvents(day?.events ?? [], browse);
  return events.map(row).join("") || `<li class="status">No sessions match.</li>`;
}

function daySelector(model, browse) {
  return `<nav class="days">${model.days
    .map(
      (d, i) =>
        `<button data-day="${i}" class="${i === browse.dayIndex ? "active" : ""}">${esc(d.date)}</button>`,
    )
    .join("")}</nav>`;
}

function select(id, label, options, value) {
  return `<select id="${id}">
    <option value="">${label}</option>
    ${options
      .map((o) => `<option ${o === value ? "selected" : ""} value="${esc(o)}">${esc(o)}</option>`)
      .join("")}
  </select>`;
}

function row(e) {
  return `<li>
    <a href="#/event/${encodeURIComponent(e.key)}">
      <span class="time">${esc(e.startLabel)}–${esc(e.endLabel)}</span>
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      ${e.persons.length ? `<span class="who">${esc(e.persons.join(", "))}</span>` : ""}
    </a>
  </li>`;
}

function wire(app, state) {
  app.querySelector(".days")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-day]");
    if (!b) return;
    state.browse.dayIndex = Number(b.dataset.day);
    renderBrowse(app, state);
  });
  for (const id of ["room", "track"]) {
    app.querySelector(`#${id}`)?.addEventListener("change", (e) => {
      state.browse[id] = e.target.value;
      renderBrowse(app, state);
    });
  }
  const q = app.querySelector("#q");
  q.addEventListener("input", () => {
    state.browse.q = q.value;
    // re-render the list only, so the search input keeps focus
    app.querySelector(".events").innerHTML = list(
      state.model.days[state.browse.dayIndex] ?? state.model.days[0],
      state.browse,
    );
  });
}
```

- [ ] **Step 5: Create `app/js/views/event.js`**

```js
import { esc } from "../html.js";

export function renderEvent(app, state, key) {
  const ev = state.model.days.flatMap((d) => d.events).find((e) => e.key === key);
  if (!ev) {
    app.innerHTML = `<div class="pad">
      <p class="error">Session not found.</p>
      <p><a href="#/browse">‹ Program</a></p>
    </div>`;
    return;
  }
  const para = (text, cls) =>
    text ? `<p class="${cls}">${esc(text).replaceAll("\n", "<br>")}</p>` : "";
  app.innerHTML = `
    <div class="pad detail">
      <p><a href="#/browse">‹ Program</a></p>
      <h1>${esc(ev.title)}</h1>
      ${ev.subtitle ? `<p class="subtitle">${esc(ev.subtitle)}</p>` : ""}
      <p class="meta">
        ${esc(ev.startLabel)}–${esc(ev.endLabel)}
        · <span class="room">${esc(ev.room)}</span>
        ${ev.track ? `· ${esc(ev.track)}` : ""}
      </p>
      ${ev.persons.length ? `<p class="who">${esc(ev.persons.join(", "))}</p>` : ""}
      ${para(ev.abstract, "abstract")}
      ${para(ev.description, "description")}
    </div>`;
}
```

- [ ] **Step 6: Create `app/css/app.css`**

```css
:root {
  --fg: #1a1a1a;
  --bg: #ffffff;
  --muted: #666;
  --line: #e2e2e2;
  --accent: #0a5;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  color: var(--fg);
  background: var(--bg);
  font-size: 16px;
  line-height: 1.4;
}

.pad { padding: 1rem; }
.error { color: #b00020; }
.status { color: var(--muted); }

.bar {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
}
.bar h1 { margin: 0; font-size: 1.1rem; }

.days { display: flex; gap: 0.5rem; padding: 0.5rem 1rem; overflow-x: auto; }
.days button {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--line);
  background: var(--bg);
  border-radius: 6px;
  font: inherit;
}
.days button.active { border-color: var(--accent); color: var(--accent); }

.filters {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.filters select, .filters input {
  font: inherit;
  padding: 0.4rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  min-height: 40px;
}
.filters input[type="search"] { flex: 1; min-width: 8rem; }

.events { list-style: none; margin: 0; padding: 0; }
.events li { border-bottom: 1px solid var(--line); }
.events a {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0 0.75rem;
  padding: 0.6rem 1rem;
  color: inherit;
  text-decoration: none;
  min-height: 44px;
}
.events .time { color: var(--muted); font-variant-numeric: tabular-nums; }
.events .room { color: var(--accent); font-weight: 600; }
.events .title { grid-column: 2; }
.events .who { grid-column: 2; color: var(--muted); font-size: 0.9rem; }

.detail h1 { font-size: 1.3rem; margin: 0.25rem 0; }
.detail .meta { color: var(--muted); }
.detail .meta .room { color: var(--accent); font-weight: 600; }
.detail .who { font-weight: 600; }
.detail a { color: var(--accent); text-decoration: none; }
```

- [ ] **Step 7: Syntax-check every module**

```bash
node --check app/js/schedule.js && node --check app/js/filter.js && node --check app/js/html.js && node --check app/js/main.js && node --check app/js/views/browse.js && node --check app/js/views/event.js && echo SYNTAX-OK
```

Expected: `SYNTAX-OK`

- [ ] **Step 8: HTTP smoke test**

Serve the repo root and confirm the shell and modules resolve (run the server in the background, then curl):

```bash
(cd . && uv run python -m http.server 8123 &) && sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123/app/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123/app/js/main.js
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123/conferences/fagfestival-2026.json
```

Expected: three lines of `200`. Kill the server afterwards (find and stop the python process).

- [ ] **Step 9: Run the full test suite once more**

Run: `node --test tests/`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add app/ && git commit -m "feat: app shell with browse and detail views"
```

---

## Manual QA (after all tasks — done by the human/controller in a real browser)

Serve repo root (`uv run python -m http.server 8123`), open
`http://localhost:8123/app/?url=/conferences/fagfestival-2026.json`:

1. Program renders: 48 rows, room name visible per row, anchors (Fellesareal, no speaker) present, ordered by time.
2. Room filter → only that room. Track filter → only that track. Search "copilot" → matching sessions. Clearing filters restores all.
3. Tap a session → detail with abstract; back link returns with filters intact.
4. Tap an anchor (e.g. lunch) → detail renders without speakers/abstract.
5. Open with a bad URL (`?url=/nope.json`) → clear error + load form + file import offered.
6. No horizontal scroll on a phone-width viewport.
