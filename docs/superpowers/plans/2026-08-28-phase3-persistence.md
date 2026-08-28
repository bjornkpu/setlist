# Phase 3: Persistence + Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedules cached in IndexedDB and restored on boot; plan states (pick/maybe/avoid) settable from browse and detail, persisted instantly, with conflict-replace + undo toast — build order step 3 of `docs/REQUIREMENTS.md` §8.

**Architecture:** A pure plan-state module (`plan.js`, node-tested), a thin IndexedDB promise wrapper (`db.js`), a localStorage wrapper (`settings.js`), and a new `store.js` that owns app state + async actions (activate schedule, restore on boot, set plan state). `main.js` slims down to routing/loading UI; views read state and call store actions. Plan records key on event `guid ?? id`, so reloading an updated schedule keeps the plan (spec §Persistence).

**Tech Stack:** Plain JS ES modules, IndexedDB, localStorage. No build, no dependencies. `node --test tests/` for pure logic.

**Spec:** `docs/superpowers/specs/2026-08-28-setlist-design.md` (Persistence, decision 11 conflict UX, decision 10 avoid dimmed; `docs/REQUIREMENTS.md` §4.5, §5.3)

## Global Constraints

- No build step, no framework, no dependencies. Native ES modules.
- All schedule-sourced text HTML-escaped (`esc`) before `innerHTML`. Toast uses `textContent` (no markup).
- Plan entries key on event `key` (`guid ?? id` from normalize). One plans record per schedule: `{key: scheduleKey, entries: {eventKey: "pick"|"maybe"|"avoid"}}` — absent entry = state none.
- At most one pick among mutually overlapping events (pairwise: `a.start < b.end && b.start < a.end`). A new pick replaces the old with an undo toast — never silently (spec decision 11).
- Avoided sessions stay listed in browse, dimmed (spec decision 10). Anchors and avoided events are never removed from lists.
- Every state change persists immediately; storage failures (private mode) degrade to in-memory, never crash.
- **Schedule key** (IndexedDB key for both `schedules` and `plans` stores): the source URL for URL loads; for file imports `file:<acronym or title>:<conference.start>` — stable across re-imports of an updated file, distinct across conferences (resolves the phase-2 review's file-name collision finding).
- IndexedDB: database `setlist` version 1, object stores `schedules`, `plans`, `providers` (providers created now, used in phase 6 — avoids a version bump).
- localStorage keys prefixed `setlist:`.
- Test command: `node --test tests/`. Commits: Conventional Commits, subject ≤ 50 chars.

---

### Task 1: `plan.js` — plan state machine (TDD)

**Files:**
- Create: `app/js/plan.js`
- Test: `tests/plan.test.js`

**Interfaces:**
- Produces (used by Task 2's store and phase 4's glance):
  - `overlaps(a, b) -> boolean` — pairwise time-range intersection on `{start, end}` epoch ms.
  - `stateOf(entries, key) -> "pick"|"maybe"|"avoid"|""`
  - `cycle(current) -> next` — `"" → pick → maybe → avoid → ""` (browse row quick-toggle).
  - `setState(entries, event, newState, allEvents) -> {entries, replacedKey}` — pure; input object untouched; `newState: ""` deletes the entry; a pick clears any existing pick on an overlapping event and reports it as `replacedKey` (else `null`).

- [ ] **Step 1: Write the failing tests**

Create `tests/plan.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { overlaps, stateOf, cycle, setState } from "../app/js/plan.js";

const ev = (key, start, end) => ({ key, start, end });
const A = ev("a", 100, 200);
const B = ev("b", 150, 250); // overlaps A
const C = ev("c", 200, 300); // back-to-back with A: no overlap
const all = [A, B, C];

test("overlaps is pairwise intersection, back-to-back excluded", () => {
  assert.equal(overlaps(A, B), true);
  assert.equal(overlaps(B, A), true);
  assert.equal(overlaps(A, C), false);
  assert.equal(overlaps(ev("x", 0, 1000), A), true); // containment
});

test("stateOf defaults to empty string", () => {
  assert.equal(stateOf({}, "a"), "");
  assert.equal(stateOf({ a: "pick" }, "a"), "pick");
});

test("cycle walks none -> pick -> maybe -> avoid -> none", () => {
  assert.equal(cycle(""), "pick");
  assert.equal(cycle("pick"), "maybe");
  assert.equal(cycle("maybe"), "avoid");
  assert.equal(cycle("avoid"), "");
});

test("setState sets and clears without mutating input", () => {
  const before = {};
  const { entries, replacedKey } = setState(before, A, "maybe", all);
  assert.deepEqual(entries, { a: "maybe" });
  assert.deepEqual(before, {});
  assert.equal(replacedKey, null);
  assert.deepEqual(setState(entries, A, "", all).entries, {});
});

test("second pick in overlapping range replaces the first", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKey } = setState(one, B, "pick", all);
  assert.deepEqual(entries, { b: "pick" });
  assert.equal(replacedKey, "a");
});

test("non-overlapping picks coexist", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKey } = setState(one, C, "pick", all);
  assert.deepEqual(entries, { a: "pick", c: "pick" });
  assert.equal(replacedKey, null);
});

test("maybe and avoid are unbounded and never conflict", () => {
  let entries = {};
  for (const e of all) entries = setState(entries, e, "maybe", all).entries;
  assert.deepEqual(entries, { a: "maybe", b: "maybe", c: "maybe" });
  entries = setState(entries, A, "avoid", all).entries;
  assert.equal(entries.a, "avoid");
  assert.equal(entries.b, "maybe");
});

test("re-picking the same event is a no-op replace", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKey } = setState(one, A, "pick", all);
  assert.deepEqual(entries, { a: "pick" });
  assert.equal(replacedKey, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: plan tests FAIL (module not found); existing 14 still pass.

- [ ] **Step 3: Write the implementation**

Create `app/js/plan.js`:

```js
// Plan state machine. Pure; no DOM, no storage. Terms: CONTEXT.md.

const ORDER = ["", "pick", "maybe", "avoid"];

export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function stateOf(entries, key) {
  return entries[key] ?? "";
}

export function cycle(current) {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}

// Pure: returns a new entries object; the input is never mutated.
// A pick clears any existing pick on an overlapping event (spec: at most
// one pick per overlapping range) and reports it as replacedKey.
export function setState(entries, event, newState, allEvents) {
  const next = { ...entries };
  let replacedKey = null;
  if (newState === "pick") {
    for (const other of allEvents) {
      if (other.key !== event.key && next[other.key] === "pick" && overlaps(event, other)) {
        replacedKey = other.key;
        delete next[other.key];
      }
    }
  }
  if (newState) next[event.key] = newState;
  else delete next[event.key];
  return { entries: next, replacedKey };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/`
Expected: all PASS (22 total)

- [ ] **Step 5: Commit**

```bash
git add app/js/plan.js tests/plan.test.js
git commit -m "feat: plan state machine with pick conflicts"
```

---

### Task 2: Persistence plumbing — `db.js`, `settings.js`, `store.js`, `main.js` refactor

**Files:**
- Create: `app/js/db.js`
- Create: `app/js/settings.js`
- Create: `app/js/store.js`
- Modify: `app/js/main.js` (state and activation move to store.js)

**Interfaces:**
- Consumes: `normalize` (schedule.js), `setState`/`stateOf` (plan.js)
- Produces (used by Task 3 and later phases):
  - `db.js`: `dbGet(store, key)`, `dbGetAll(store)`, `dbPut(store, value)`, `dbDelete(store, key)` — all promise-returning; DB `setlist` v1 with stores `schedules`/`plans`/`providers`, keyPath `key`.
  - `settings.js`: `getSetting(name) -> string`, `setSetting(name, value)` — `setlist:`-prefixed localStorage, try/catch guarded.
  - `store.js`: `state` (moved from main.js, plus `scheduleKey`, `plan`), `activate(json, {url, fromFile, label})`, `restoreLast() -> Promise<boolean>`, `setPlanState(eventKey, newState) -> Promise<replacedKey|null>`, `planStateOf(eventKey) -> state string`, `scheduleKeyFor(json, url, fromFile)`.
  - `main.js` keeps: routing, `loadSchedule(url)`, `renderLoadScreen`, and re-exports nothing new; `import { state } from "./store.js"` replaces the old local `state`.

No node tests (IndexedDB/localStorage are browser-only; store logic that is testable — key derivation — gets one test). Verification: one new node test for `scheduleKeyFor`, syntax checks, HTTP smoke, manual QA at the end.

- [ ] **Step 1: Write the failing test for schedule-key derivation**

Append to `tests/plan.test.js` (small enough not to warrant its own file):

```js
import { scheduleKeyFor } from "../app/js/store.js";

test("scheduleKeyFor: URL loads key on the URL, file imports on identity", () => {
  const json = { schedule: { conference: { acronym: "fagfest2026", title: "Fagfestival 2026", start: "2026-08-26" } } };
  assert.equal(scheduleKeyFor(json, "https://x/s.json", false), "https://x/s.json");
  assert.equal(scheduleKeyFor(json, "", true), "file:fagfest2026:2026-08-26");
  const noAcr = { schedule: { conference: { title: "T", start: "2026-01-01" } } };
  assert.equal(scheduleKeyFor(noAcr, "", true), "file:T:2026-01-01");
});
```

Run: `node --test tests/` — expected: FAIL (store.js missing). NOTE: `store.js` imports `db.js`/`settings.js`, which reference `indexedDB`/`localStorage` at call time only, never at module top level — imports must stay side-effect-free so node can load `store.js` for this test.

- [ ] **Step 2: Create `app/js/db.js`**

```js
// Thin IndexedDB promise wrapper. Stores: schedules, plans, providers (phase 6).

const DB_NAME = "setlist";
const VERSION = 1;
const STORES = ["schedules", "plans", "providers"];

let dbPromise;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: "key" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return (dbPromise ??= open()).then(
    (d) =>
      new Promise((resolve, reject) => {
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const dbGet = (store, key) => tx(store, "readonly", (s) => s.get(key));
export const dbGetAll = (store) => tx(store, "readonly", (s) => s.getAll());
export const dbPut = (store, value) => tx(store, "readwrite", (s) => s.put(value));
export const dbDelete = (store, key) => tx(store, "readwrite", (s) => s.delete(key));
```

- [ ] **Step 3: Create `app/js/settings.js`**

```js
// localStorage wrapper. Storage can throw (private mode, blocked) — degrade silently.

export function getSetting(name) {
  try {
    return localStorage.getItem("setlist:" + name) ?? "";
  } catch {
    return "";
  }
}

export function setSetting(name, value) {
  try {
    localStorage.setItem("setlist:" + name, value);
  } catch {
    // best effort; app runs in-memory without settings
  }
}
```

- [ ] **Step 4: Create `app/js/store.js`**

```js
// App state + actions. Views read state and call actions; main.js routes.

import { normalize } from "./schedule.js";
import { setState as planSetState, stateOf } from "./plan.js";
import { dbGet, dbGetAll, dbPut } from "./db.js";
import { getSetting, setSetting } from "./settings.js";

export const state = {
  model: null,      // normalized schedule
  scheduleKey: "",  // IndexedDB key for schedules + plans records
  sourceUrl: "",    // display label: URL, or file name for imports
  plan: {},         // eventKey -> "pick" | "maybe" | "avoid"
  browse: { dayIndex: 0, room: "", track: "", q: "" },
};

export function scheduleKeyFor(json, url, fromFile) {
  if (!fromFile) return url;
  const conf = json?.schedule?.conference ?? {};
  return `file:${conf.acronym || conf.title || "schedule"}:${conf.start || ""}`;
}

function defaultDayIndex(model) {
  const today = new Date().toLocaleDateString("sv-SE"); // sv-SE = YYYY-MM-DD, local time
  const i = model.days.findIndex((d) => d.date === today);
  return i === -1 ? 0 : i;
}

export function allEvents() {
  return state.model ? state.model.days.flatMap((d) => d.events) : [];
}

// Throws if json is not a frab schedule — callers surface the message.
export async function activate(json, { url = "", fromFile = false, label = "" } = {}) {
  const model = normalize(json);
  const key = scheduleKeyFor(json, url, fromFile);
  state.model = model;
  state.scheduleKey = key;
  state.sourceUrl = url || label;
  state.browse = { dayIndex: defaultDayIndex(model), room: "", track: "", q: "" };
  state.plan = {};
  try {
    // read the plan BEFORE writing the schedule: if the read fails we stay
    // in-memory and never risk overwriting a stored plan with an empty one
    state.plan = (await dbGet("plans", key))?.entries ?? {};
    await dbPut("schedules", {
      key,
      url,
      json,
      title: model.title,
      start: model.start,
      end: model.end,
      loadedAt: Date.now(),
    });
    setSetting("activeSchedule", key);
  } catch {
    // storage unavailable: keep running in-memory
  }
}

// Boot without ?url=: activate the schedule covering today, else the last
// active one, else the most recently loaded. False if nothing is cached.
export async function restoreLast() {
  let all;
  try {
    all = await dbGetAll("schedules");
  } catch {
    return false;
  }
  if (!all?.length) return false;
  const today = new Date().toLocaleDateString("sv-SE");
  const record =
    all.find((s) => s.start && s.end && s.start <= today && today <= s.end) ??
    all.find((s) => s.key === getSetting("activeSchedule")) ??
    all.reduce((a, b) => (a.loadedAt >= b.loadedAt ? a : b));
  try {
    await activate(record.json, {
      url: record.url,
      fromFile: record.key.startsWith("file:"),
      label: record.key,
    });
    return true;
  } catch {
    return false; // cached record no longer parses; leave load screen
  }
}

// Returns the replaced pick's event key when a conflict was resolved, else null.
export async function setPlanState(eventKey, newState) {
  const events = allEvents();
  const event = events.find((e) => e.key === eventKey);
  if (!event) return null;
  const { entries, replacedKey } = planSetState(state.plan, event, newState, events);
  state.plan = entries;
  try {
    await dbPut("plans", { key: state.scheduleKey, entries });
  } catch {
    // in-memory only
  }
  return replacedKey;
}

export function planStateOf(eventKey) {
  return stateOf(state.plan, eventKey);
}
```

- [ ] **Step 5: Refactor `app/js/main.js`**

Replace the whole file with:

```js
import { renderBrowse } from "./views/browse.js";
import { renderEvent } from "./views/event.js";
import { esc } from "./html.js";
import { state, activate, restoreLast } from "./store.js";

const app = document.getElementById("app");

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
    await activate(json, { url });
  } catch (e) {
    renderLoadScreen(`${url}: ${e.message}`);
    return;
  }
  location.hash = "#/browse"; // phase 4: glance claims #/
  route();
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
      await activate(JSON.parse(await file.text()), { fromFile: true, label: file.name });
      location.hash = "#/browse"; // phase 4: glance claims #/
      route();
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
    let key;
    try {
      key = decodeURIComponent(evMatch[1]);
    } catch {
      key = evMatch[1]; // malformed encoding: use raw, falls through to "Session not found"
    }
    renderEvent(app, state, key);
  } else {
    renderBrowse(app, state); // #/browse and, for now, everything else
  }
}

window.addEventListener("hashchange", route);

const startUrl = new URLSearchParams(location.search).get("url");
if (startUrl) {
  loadSchedule(startUrl);
} else {
  restoreLast().then(route);
}
```

- [ ] **Step 6: Verify**

```bash
node --test tests/
node --check app/js/db.js && node --check app/js/settings.js && node --check app/js/store.js && node --check app/js/main.js && echo SYNTAX-OK
```

Expected: all tests PASS (23), `SYNTAX-OK`. Then HTTP smoke as in phase 2 (serve repo root with `uv run python -m http.server 8123`, curl `app/` and `app/js/store.js` → 200, kill server).

- [ ] **Step 7: Commit**

```bash
git add app/js/ tests/plan.test.js
git commit -m "feat: persist schedules and plan in IndexedDB"
```

---

### Task 3: Selection UI — toast, browse states, detail buttons

**Files:**
- Create: `app/js/toast.js`
- Modify: `app/js/views/browse.js`
- Modify: `app/js/views/event.js`
- Modify: `app/css/app.css` (append)

**Interfaces:**
- Consumes: `setPlanState`, `planStateOf`, `allEvents` (store.js), `cycle` (plan.js), `showToast` (toast.js)
- Produces: user-visible selection. Browse rows get a quick-cycle state button and avoid-dimming; detail gets Pick/Maybe/Avoid toggle buttons; a pick conflict shows "Replaced: <title>" with Undo.

- [ ] **Step 1: Create `app/js/toast.js`**

```js
// Single transient toast with optional action. textContent only — no markup.

export function showToast(message, { actionLabel = "", onAction = null, duration = 6000 } = {}) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  if (actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      el.remove();
      onAction?.();
    });
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
```

- [ ] **Step 2: Add the shared conflict-toast helper and state button to `app/js/views/browse.js`**

Replace the whole file with:

```js
import { esc } from "../html.js";
import { filterEvents } from "../filter.js";
import { cycle } from "../plan.js";
import { setPlanState, planStateOf, allEvents } from "../store.js";
import { showToast } from "../toast.js";

const STATE_ICON = { pick: "✓", maybe: "?", avoid: "✕", "": "+" };

// Shared by browse rows and the detail view: apply a state change and
// surface a replaced pick with Undo (spec decision 11).
export async function applyState(eventKey, newState, rerender) {
  const replacedKey = await setPlanState(eventKey, newState);
  rerender();
  if (replacedKey) {
    const replaced = allEvents().find((e) => e.key === replacedKey);
    showToast(`Replaced pick: ${replaced?.title ?? "session"}`, {
      actionLabel: "Undo",
      onAction: async () => {
        await setPlanState(replacedKey, "pick"); // conflict logic clears the new pick
        rerender();
      },
    });
  }
}

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

function row(e) {
  const st = planStateOf(e.key);
  return `<li class="state-${st || "none"}">
    <a href="#/event/${encodeURIComponent(e.key)}">
      <span class="time">${esc(e.startLabel)}–${esc(e.endLabel)}</span>
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      ${e.persons.length ? `<span class="who">${esc(e.persons.join(", "))}</span>` : ""}
    </a>
    <button class="plan-btn" data-key="${esc(e.key)}"
      aria-label="Plan state: ${st || "none"}">${STATE_ICON[st]}</button>
  </li>`;
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
  return `<select id="${id}" aria-label="${label}">
    <option value="">${label}</option>
    ${options
      .map((o) => `<option ${o === value ? "selected" : ""} value="${esc(o)}">${esc(o)}</option>`)
      .join("")}
  </select>`;
}

function wire(app, state) {
  const rerenderList = () => {
    app.querySelector(".events").innerHTML = list(
      state.model.days[state.browse.dayIndex] ?? state.model.days[0],
      state.browse,
    );
  };
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
    rerenderList(); // list only, so the search input keeps focus
  });
  app.querySelector(".events").addEventListener("click", (e) => {
    const btn = e.target.closest(".plan-btn");
    if (!btn) return;
    applyState(btn.dataset.key, cycle(planStateOf(btn.dataset.key)), rerenderList);
  });
}
```

Note: the `.events` click listener survives `rerenderList()` because it sits on the `<ul>`, whose children are replaced — delegation, no re-wiring needed.

- [ ] **Step 3: Add state buttons to `app/js/views/event.js`**

Replace the whole file with:

```js
import { esc } from "../html.js";
import { planStateOf } from "../store.js";
import { applyState } from "./browse.js";

export function renderEvent(app, state, key) {
  const ev = state.model.days.flatMap((d) => d.events).find((e) => e.key === key);
  if (!ev) {
    app.innerHTML = `<div class="pad">
      <p class="error">Session not found.</p>
      <p><a href="#/browse">‹ Program</a></p>
    </div>`;
    return;
  }
  const current = planStateOf(ev.key);
  const para = (text, cls) =>
    text ? `<p class="${cls}">${esc(text).replaceAll("\n", "<br>")}</p>` : "";
  const stateBtn = (value, label) =>
    `<button data-state="${value}" class="${current === value ? "active" : ""}">${label}</button>`;
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
      <div class="plan-states" role="group" aria-label="Plan state">
        ${stateBtn("pick", "Pick")}${stateBtn("maybe", "Maybe")}${stateBtn("avoid", "Avoid")}
      </div>
      ${ev.persons.length ? `<p class="who">${esc(ev.persons.join(", "))}</p>` : ""}
      ${para(ev.abstract, "abstract")}
      ${para(ev.description, "description")}
    </div>`;
  app.querySelector(".plan-states").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-state]");
    if (!btn) return;
    const value = btn.dataset.state;
    const next = planStateOf(ev.key) === value ? "" : value; // tap active state to clear
    applyState(ev.key, next, () => renderEvent(app, state, key));
  });
}
```

- [ ] **Step 4: Append to `app/css/app.css`**

```css
/* plan states */
.events li { display: flex; align-items: stretch; }
.events li > a { flex: 1; }
.events li.state-avoid > a { opacity: 0.45; }
.events li.state-pick .room { font-weight: 700; }
.plan-btn {
  font: inherit;
  min-width: 44px;
  border: none;
  border-left: 1px solid var(--line);
  background: none;
  color: var(--muted);
}
.state-pick .plan-btn { color: var(--accent); }
.state-maybe .plan-btn { color: #b07d00; }
.state-avoid .plan-btn { color: #b00020; }

.plan-states { display: flex; gap: 0.5rem; margin: 0.75rem 0; }
.plan-states button {
  font: inherit;
  padding: 0.5rem 1rem;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: none;
}
.plan-states button.active {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  display: flex;
  gap: 1rem;
  align-items: center;
  max-width: calc(100vw - 2rem);
  padding: 0.75rem 1rem;
  background: var(--fg);
  color: var(--bg);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.3);
}
.toast button {
  font: inherit;
  font-weight: 700;
  min-height: 40px;
  border: none;
  background: none;
  color: var(--bg);
  text-decoration: underline;
}
```

- [ ] **Step 5: Verify**

```bash
node --test tests/
node --check app/js/toast.js && node --check app/js/views/browse.js && node --check app/js/views/event.js && echo SYNTAX-OK
```

Expected: 23 tests PASS, `SYNTAX-OK`. HTTP smoke: serve repo root, curl `app/` and `app/js/toast.js` → 200, kill server.

- [ ] **Step 6: Commit**

```bash
git add app/
git commit -m "feat: selection UI with conflict undo toast"
```

---

## Manual QA (after all tasks — human, real browser)

Serve repo root (`uv run python -m http.server 8123`), open
`http://localhost:8123/app/?url=/conferences/fagfestival-2026.json`:

1. Pick a session from its detail — button highlights; back to program — row shows ✓.
2. Pick an overlapping session (same time, other track) — toast "Replaced pick: …" appears; Undo restores the first pick and clears the second.
3. Cycle a row's state button: + → ✓ → ? → ✕ → +; avoid dims the row but keeps it listed.
4. Reload the page with no `?url=` — the schedule and all states come back (IndexedDB + auto-restore).
5. Re-open with the same `?url=` — plan survives the schedule refresh.
6. Import the schedule as a file (download it first), set a state, re-import the same file — plan survives (stable `file:` key).
7. DevTools → Application → IndexedDB `setlist`: `schedules` and `plans` records present, plan entries keyed by guid.
