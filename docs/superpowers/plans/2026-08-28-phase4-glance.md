# Phase 4: Glance View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The primary screen: where do I go now / next, resolved from picks and solo events, room name as the largest text, self-updating — build order step 4 of `docs/REQUIREMENTS.md` §8, spec §5.1.

**Architecture:** A pure resolver (`glance.js`: `resolveGlance(events, plan, now)` + `slotFor`, node-tested) sits on plan.js's `overlaps`/`stateOf`. A `clock.js` module supplies `now()` with a `?at=` override so a past conference (Fagfestival ran 2026-08-26) is testable in a real browser. `views/glance.js` renders the resolution; `views/slot.js` is the tap-through slot detail. `#/` becomes the glance route; one module-level 30 s interval plus `visibilitychange` re-renders it.

**Tech Stack:** Plain JS ES modules, no build, no dependencies. `node --test tests/`.

**Spec:** `docs/superpowers/specs/2026-08-28-setlist-design.md` (Glance resolution; decisions 1, 2, 6; `docs/REQUIREMENTS.md` §5.1)

## Global Constraints

- No build step, no framework, no dependencies. All schedule-sourced text escaped via `esc` before `innerHTML`.
- Glance rules (spec): destination of a time range = overlapping **pick**, else overlapping **solo event** (the only event whose range nothing else overlaps, judged against ALL events; an avoided solo is suppressed), else null. **Now** = destination among events with `start <= now < end`. **Next** = the slot of the earliest-starting non-avoided upcoming event; a pick or solo in that slot wins, else the no-pick fallback (maybes first, then the rest). Before first start: "before" phase. At/after last end: "after" phase.
- Zero-duration events (`end === start`) can never be "Now" (`start <= now < end` is unsatisfiable) — accepted rule; they may still appear as Next.
- **Room name is the largest text on the glance screen** — larger than the title. No scrolling on glance. Avoided events never surface there.
- Exactly ONE 30-second interval, installed at `main.js` module top level — never inside a view render (renders repeat; `location.hash` assignment double-fires `route()`, which must stay idempotent).
- `clock.js` is the only source of "now" in app code (`Date.now()` never called elsewhere); `?at=<ISO datetime>` freezes it for QA and is NOT stripped from the URL.
- Routes after this phase: `#/` glance (default), `#/browse`, `#/event/:key`, `#/slot/:key`. Loading a schedule navigates to `#/`.
- Test command: `node --test tests/`. Commits: Conventional Commits, subject ≤ 50 chars.

---

### Task 1: `clock.js`, epoch day bounds, window-based default day (TDD)

**Files:**
- Create: `app/js/clock.js`
- Modify: `app/js/schedule.js` (day `dayStart`/`dayEnd` become epoch ms)
- Modify: `app/js/store.js` (`defaultDayIndex` exported, window-based, clock-driven)
- Test: `tests/schedule.test.js` (append), `tests/plan.test.js` (append)

**Interfaces:**
- `clock.js`: `now() -> ms` (override ?? Date.now()), `setNowOverride(ms|null)`.
- `schedule.js` day objects: `dayStart`/`dayEnd` are now **epoch ms** (0 when unparseable) — previously raw ISO strings; nothing else read them, so no other call sites change.
- `store.js`: `defaultDayIndex(model, nowMs) -> index` exported pure: the day whose `[dayStart, dayEnd)` window contains nowMs, else the day whose `date` equals nowMs's local date, else 0. `activate()` calls it with `now()` from clock.js.

- [ ] **Step 1: Write the failing tests**

Append to `tests/schedule.test.js`:

```js
test("normalize exposes day bounds as epoch ms", () => {
  const m = normalize(fixture());
  const day = m.days[0];
  assert.equal(day.dayStart, Date.parse("2026-08-26T08:00:00+02:00"));
  assert.equal(day.dayEnd, Date.parse("2026-08-26T18:00:00+02:00"));
});
```

Append to `tests/plan.test.js` (store.js is already imported there):

```js
import { defaultDayIndex } from "../app/js/store.js";

test("defaultDayIndex prefers the day window over the calendar date", () => {
  const model = {
    days: [
      { date: "2026-08-26", dayStart: 1000, dayEnd: 2000 },
      { date: "2026-08-27", dayStart: 2000, dayEnd: 3000 },
    ],
  };
  assert.equal(defaultDayIndex(model, 1500), 0);
  assert.equal(defaultDayIndex(model, 2000), 1); // day 0 window is half-open
  assert.equal(defaultDayIndex(model, 9999), 0); // outside every window, no date match -> 0
});
```

Run: `node --test tests/` — expected: FAIL (`dayStart` is a string; `defaultDayIndex` not exported).

- [ ] **Step 2: Create `app/js/clock.js`**

```js
// The app's single source of time. ?at=<ISO> freezes it for QA.

let override = null;

export function setNowOverride(ms) {
  override = ms;
}

export function now() {
  return override ?? Date.now();
}
```

- [ ] **Step 3: Convert day bounds in `app/js/schedule.js`**

In `normalize`'s day mapping, replace

```js
      dayStart: day?.day_start ?? "",
      dayEnd: day?.day_end ?? "",
```

with

```js
      dayStart: Date.parse(day?.day_start ?? "") || 0,
      dayEnd: Date.parse(day?.day_end ?? "") || 0,
```

(`Date.parse` yields NaN for junk; `NaN || 0` → 0.)

- [ ] **Step 4: Rework `defaultDayIndex` in `app/js/store.js`**

Add `import { now } from "./clock.js";` to the imports. Replace the private `defaultDayIndex` with an exported pure version:

```js
export function defaultDayIndex(model, nowMs) {
  const inWindow = model.days.findIndex((d) => d.dayStart <= nowMs && nowMs < d.dayEnd);
  if (inWindow !== -1) return inWindow;
  const today = new Date(nowMs).toLocaleDateString("sv-SE"); // sv-SE = YYYY-MM-DD, local time
  const byDate = model.days.findIndex((d) => d.date === today);
  return byDate === -1 ? 0 : byDate;
}
```

and change its call in `activate()` to `defaultDayIndex(model, now())`.

- [ ] **Step 5: Run tests to verify all pass**

Run: `node --test tests/`
Expected: all PASS (26)

- [ ] **Step 6: Commit**

```bash
git add app/js/clock.js app/js/schedule.js app/js/store.js tests/
git commit -m "feat: clock module and epoch day bounds"
```

---

### Task 2: `glance.js` — now/next resolution (TDD)

**Files:**
- Create: `app/js/glance.js`
- Test: `tests/glance.test.js`

**Interfaces:**
- Consumes: `overlaps`, `stateOf` (plan.js); events carry `{key, start, end, room, startLabel, endLabel, title, persons}`.
- Produces (used by Task 3's views):
  - `resolveGlance(events, plan, now) -> {phase, current, next, firstStart, lastEnd}` — `phase: "empty"|"before"|"during"|"after"`; `current`/`next` are `null` or `{dest, ref}` where `dest` is the resolved destination event (or null when the slot has no pick/solo) and `ref` is the slot-reference event for the `#/slot/:key` link (always set when the group exists).
  - `slotEvents(events, ref) -> events` — everything overlapping ref, ref included.
  - `slotFor(events, plan, ref) -> {picks, maybes, rest, avoided}` — slot bucketed by plan state, each bucket start-sorted.
  - `fmtUntil(ms) -> "now" | "in N min" | "in H h M min"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/glance.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveGlance, slotEvents, slotFor, fmtUntil } from "../app/js/glance.js";

const MIN = 60000;
const ev = (key, start, end, room = "R" + key) => ({
  key, start: start * MIN, end: end * MIN, room,
  startLabel: "", endLabel: "", title: "T" + key, persons: [],
});

// Timeline (minutes): reg 0-60 solo; a1/b1 parallel 60-110;
// lunch 120-170 solo; a2/b2 parallel 170-220. Gap 110-120.
const reg = ev("reg", 0, 60, "Fellesareal");
const a1 = ev("a1", 60, 110);
const b1 = ev("b1", 60, 110);
const lunch = ev("lunch", 120, 170, "Fellesareal");
const a2 = ev("a2", 170, 220);
const b2 = ev("b2", 170, 220);
const EVENTS = [reg, a1, b1, lunch, a2, b2];
const at = (min) => min * MIN;

test("phase boundaries", () => {
  assert.equal(resolveGlance(EVENTS, {}, at(-10)).phase, "before");
  assert.equal(resolveGlance(EVENTS, {}, at(100)).phase, "during");
  assert.equal(resolveGlance(EVENTS, {}, at(220)).phase, "after");
  assert.equal(resolveGlance([], {}, 0).phase, "empty");
});

test("solo event is Now without a pick", () => {
  const g = resolveGlance(EVENTS, {}, at(30));
  assert.equal(g.current.dest.key, "reg");
});

test("pick beats parallel sessions as Now", () => {
  const g = resolveGlance(EVENTS, { b1: "pick" }, at(90));
  assert.equal(g.current.dest.key, "b1");
});

test("parallel unpicked slot has no destination but a ref", () => {
  const g = resolveGlance(EVENTS, {}, at(90));
  assert.equal(g.current.dest, null);
  assert.ok(["a1", "b1"].includes(g.current.ref.key));
});

test("avoided solo is suppressed", () => {
  const g = resolveGlance(EVENTS, { lunch: "avoid" }, at(140));
  assert.equal(g.current.dest, null);
});

test("Next resolves the earliest upcoming slot", () => {
  const g = resolveGlance(EVENTS, { a2: "pick" }, at(140)); // during lunch
  assert.equal(g.next.dest.key, "a2");
  const g2 = resolveGlance(EVENTS, {}, at(140));
  assert.equal(g2.next.dest, null); // a2/b2 parallel, nothing picked
  assert.ok(["a2", "b2"].includes(g2.next.ref.key));
});

test("Next skips avoided events as reference", () => {
  const g = resolveGlance(EVENTS, { a2: "avoid", b2: "avoid" }, at(140));
  assert.equal(g.next, null); // nothing non-avoided upcoming
});

test("Next during the gap is the upcoming solo", () => {
  const g = resolveGlance(EVENTS, {}, at(115));
  assert.equal(g.current, null); // nothing running
  assert.equal(g.next.dest.key, "lunch");
});

test("before phase points at the first slot", () => {
  const g = resolveGlance(EVENTS, {}, at(-30));
  assert.equal(g.next.dest.key, "reg"); // solo first item
  assert.equal(g.firstStart, 0);
});

test("zero-duration event is never Now", () => {
  const z = ev("z", 90, 90);
  const g = resolveGlance([...EVENTS, z], { z: "pick" }, at(90));
  assert.notEqual(g.current?.dest?.key, "z");
});

test("slotEvents includes ref and overlapping only", () => {
  assert.deepEqual(slotEvents(EVENTS, a1).map((e) => e.key).sort(), ["a1", "b1"]);
  assert.deepEqual(slotEvents(EVENTS, reg).map((e) => e.key), ["reg"]);
});

test("slotFor buckets by plan state", () => {
  const b = slotFor(EVENTS, { a1: "pick", b1: "avoid" }, a1);
  assert.deepEqual(b.picks.map((e) => e.key), ["a1"]);
  assert.deepEqual(b.avoided.map((e) => e.key), ["b1"]);
  assert.deepEqual(b.maybes, []);
  assert.deepEqual(b.rest, []);
});

test("fmtUntil", () => {
  assert.equal(fmtUntil(20000), "now");
  assert.equal(fmtUntil(12 * MIN), "in 12 min");
  assert.equal(fmtUntil(95 * MIN), "in 1 h 35 min");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: glance tests FAIL (module not found); the other 26 pass.

- [ ] **Step 3: Write the implementation**

Create `app/js/glance.js`:

```js
// Glance resolution: where do I go now / next. Pure; no DOM. Terms: CONTEXT.md.

import { overlaps, stateOf } from "./plan.js";

// A solo event is the only thing running during its range, judged against
// ALL events — the rule is about the schedule's shape, not the plan.
function isSolo(ev, events) {
  return events.every((o) => o.key === ev.key || !overlaps(o, ev));
}

// Destination among `candidates`: an overlapping pick wins; else a
// non-avoided solo event; else null.
function destination(candidates, events, plan) {
  const pick = candidates.find((e) => stateOf(plan, e.key) === "pick");
  if (pick) return pick;
  return candidates.find((e) => stateOf(plan, e.key) !== "avoid" && isSolo(e, events)) ?? null;
}

export function slotEvents(events, ref) {
  return events.filter((e) => e.key === ref.key || overlaps(e, ref));
}

export function resolveGlance(events, plan, now) {
  if (!events.length) {
    return { phase: "empty", current: null, next: null, firstStart: 0, lastEnd: 0 };
  }
  const firstStart = Math.min(...events.map((e) => e.start));
  const lastEnd = Math.max(...events.map((e) => e.end));
  const active = events.filter((e) => e.start <= now && now < e.end);
  const activeDest = active.length ? destination(active, events, plan) : null;
  const upcoming = events
    .filter((e) => e.start > now && stateOf(plan, e.key) !== "avoid")
    .sort((a, b) => a.start - b.start || a.room.localeCompare(b.room));
  const nextRef = upcoming[0] ?? null;
  const nextDest = nextRef
    ? destination(slotEvents(events, nextRef).filter((e) => e.start > now), events, plan)
    : null;
  const phase = now < firstStart ? "before" : now >= lastEnd ? "after" : "during";
  return {
    phase,
    current: active.length ? { dest: activeDest, ref: activeDest ?? active[0] } : null,
    next: nextRef ? { dest: nextDest, ref: nextDest ?? nextRef } : null,
    firstStart,
    lastEnd,
  };
}

export function slotFor(events, plan, ref) {
  const slot = slotEvents(events, ref).sort(
    (a, b) => a.start - b.start || a.room.localeCompare(b.room),
  );
  const buckets = { picks: [], maybes: [], rest: [], avoided: [] };
  for (const e of slot) {
    const st = stateOf(plan, e.key);
    if (st === "pick") buckets.picks.push(e);
    else if (st === "maybe") buckets.maybes.push(e);
    else if (st === "avoid") buckets.avoided.push(e);
    else buckets.rest.push(e);
  }
  return buckets;
}

export function fmtUntil(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `in ${min} min`;
  return `in ${Math.floor(min / 60)} h ${min % 60} min`;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/`
Expected: all PASS (39)

- [ ] **Step 5: Commit**

```bash
git add app/js/glance.js tests/glance.test.js
git commit -m "feat: glance now/next resolver"
```

---

### Task 3: Glance + slot views, routing, tick

**Files:**
- Create: `app/js/views/glance.js`
- Create: `app/js/views/slot.js`
- Modify: `app/js/main.js` (routes, `?at=`, tick, hash targets)
- Modify: `app/js/views/browse.js` (header link to glance)
- Modify: `app/css/app.css` (append)

**Interfaces:**
- Consumes: `resolveGlance`/`slotFor`/`fmtUntil` (glance.js), `now`/`setNowOverride` (clock.js), `applyState` (actions.js), `cycle` (plan.js), `planStateOf`/`allEvents` (store.js).
- Produces: `renderGlance(app, state)`, `renderSlot(app, state, key)`. Route table: `#/event/:key` → event, `#/slot/:key` → slot, `#/browse*` → browse, everything else → glance.

- [ ] **Step 1: Create `app/js/views/glance.js`**

```js
import { esc } from "../html.js";
import { resolveGlance, slotFor, fmtUntil } from "../glance.js";
import { now } from "../clock.js";
import { allEvents } from "../store.js";

export function renderGlance(app, state) {
  const events = allEvents();
  const t = now();
  const g = resolveGlance(events, state.plan, t);
  let body;
  if (g.phase === "empty") {
    body = `<p class="status">This schedule has no events.</p>`;
  } else if (g.phase === "after") {
    body = `<div class="closing"><p class="big">That's a wrap 🎉</p>
      <p class="status">${esc(state.model.title)} has ended.</p></div>`;
  } else {
    body = `${g.current ? card("Now", g.current, events, state.plan, t) : ""}
      ${g.next ? card(g.phase === "before" ? "First up" : "Next", g.next, events, state.plan, t) : ""}
      ${!g.current && !g.next ? `<p class="status">Nothing upcoming.</p>` : ""}`;
  }
  app.innerHTML = `
    <div class="glance">
      <a class="corner" href="#/browse" aria-label="Program">☰</a>
      ${body}
    </div>`;
}

function card(label, group, events, plan, t) {
  const href = `#/slot/${encodeURIComponent(group.ref.key)}`;
  const untilLine =
    label === "Now"
      ? `ends ${esc(group.ref.endLabel)}`
      : `${esc(group.ref.startLabel)} · ${esc(fmtUntil(group.ref.start - t))}`;
  if (group.dest) {
    const e = group.dest;
    return `<a class="card ${label === "Now" ? "primary" : "secondary"}" href="${href}">
      <span class="label">${label}</span>
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      <span class="until">${untilLine}</span>
    </a>`;
  }
  // No pick for this slot: say so, offer maybes, then the full slot (spec §5.1)
  const b = slotFor(events, plan, group.ref);
  const options = [...b.maybes, ...b.rest].slice(0, 3);
  return `<a class="card ${label === "Now" ? "primary" : "secondary"} none" href="${href}">
    <span class="label">${label}</span>
    <span class="title">Nothing picked — ${b.maybes.length ? "your maybes" : "options"}:</span>
    ${options
      .map(
        (e) => `<span class="option"><span class="room-sm">${esc(e.room)}</span> ${esc(e.title)}</span>`,
      )
      .join("")}
    <span class="until">${untilLine} · tap for the full slot</span>
  </a>`;
}
```

- [ ] **Step 2: Create `app/js/views/slot.js`**

```js
import { esc } from "../html.js";
import { slotFor } from "../glance.js";
import { cycle } from "../plan.js";
import { planStateOf, allEvents } from "../store.js";
import { applyState } from "../actions.js";

const ICON = { pick: "✓", maybe: "?", avoid: "✕", "": "+" };

export function renderSlot(app, state, key) {
  const events = allEvents();
  const ref = events.find((e) => e.key === key);
  if (!ref) {
    app.innerHTML = `<div class="pad"><p class="error">Slot not found.</p><p><a href="#/">‹ Now</a></p></div>`;
    return;
  }
  const b = slotFor(events, state.plan, ref);
  const section = (label, list, cls = "") =>
    list.length
      ? `<h2>${label}</h2><ul class="events ${cls}">${list.map(row).join("")}</ul>`
      : "";
  app.innerHTML = `
    <div class="slot">
      <header class="bar">
        <a href="#/">‹ Now</a>
        <h1>${esc(ref.startLabel)}–${esc(ref.endLabel)}</h1>
      </header>
      ${section("Picked", b.picks)}
      ${section("Maybe", b.maybes)}
      ${section("Everything else", b.rest)}
      ${section("Avoided", b.avoided)}
    </div>`;
  app.querySelector(".slot").addEventListener("click", (e) => {
    const btn = e.target.closest(".plan-btn");
    if (!btn) return;
    applyState(btn.dataset.key, cycle(planStateOf(btn.dataset.key)), () =>
      renderSlot(app, state, key),
    ).catch(console.error);
  });
}

function row(e) {
  const st = planStateOf(e.key);
  return `<li class="state-${st || "none"}">
    <a href="#/event/${encodeURIComponent(e.key)}">
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      ${e.persons.length ? `<span class="who">${esc(e.persons.join(", "))}</span>` : ""}
    </a>
    <button class="plan-btn" data-key="${esc(e.key)}"
      aria-label="Plan state: ${esc(st || "none")}">${ICON[st] ?? "+"}</button>
  </li>`;
}
```

- [ ] **Step 3: Update `app/js/main.js`**

Add imports:

```js
import { renderGlance } from "./views/glance.js";
import { renderSlot } from "./views/slot.js";
import { setNowOverride } from "./clock.js";
```

Replace both `location.hash = "#/browse"; // phase 4: glance claims #/` lines (loadSchedule success path and file-import success path) with:

```js
  location.hash = "#/";
```

Replace the `route()` function's dispatch with:

```js
function route() {
  if (!state.model) {
    renderLoadScreen();
    return;
  }
  const hash = location.hash || "#/";
  const decode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s; // malformed encoding: use raw, falls through to "not found"
    }
  };
  const evMatch = hash.match(/^#\/event\/(.+)$/);
  const slotMatch = hash.match(/^#\/slot\/(.+)$/);
  if (evMatch) {
    renderEvent(app, state, decode(evMatch[1]));
  } else if (slotMatch) {
    renderSlot(app, state, decode(slotMatch[1]));
  } else if (hash.startsWith("#/browse")) {
    renderBrowse(app, state);
  } else {
    renderGlance(app, state); // #/ and anything unrecognized
  }
}
```

At module top level, after the `setlist:rerender` listener, add the QA clock override, the single tick, and the wake-up refresh:

```js
const atParam = new URLSearchParams(location.search).get("at");
if (atParam) {
  const ms = Date.parse(atParam);
  if (!Number.isNaN(ms)) setNowOverride(ms); // QA: freeze the clock; param is kept in the URL
}

// The ONLY interval in the app: refresh the glance while it is on screen.
setInterval(() => {
  const h = location.hash;
  if (state.model && (h === "" || h === "#/")) route();
}, 30000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.model) route();
});
```

- [ ] **Step 4: Add a glance link to browse's header in `app/js/views/browse.js`**

Replace the header line in `renderBrowse`:

```js
    <header class="bar"><h1>${esc(model.title)}</h1></header>
```

with

```js
    <header class="bar"><h1>${esc(model.title)}</h1><a class="now-link" href="#/">Now</a></header>
```

- [ ] **Step 5: Append to `app/css/app.css`**

```css
/* glance */
.glance {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  position: relative;
  overflow: hidden;
}
.glance .corner {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  font-size: 1.4rem;
  text-decoration: none;
  color: var(--muted);
  padding: 0.5rem;
  min-width: 44px;
  min-height: 44px;
  text-align: center;
}
.glance .card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
}
.glance .label {
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.glance .card .room {
  color: var(--accent);
  font-weight: 800;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.glance .primary .room { font-size: 2.6rem; }
.glance .secondary .room { font-size: 1.6rem; }
.glance .card .title { font-size: 1.05rem; overflow-wrap: anywhere; }
.glance .card .until { color: var(--muted); }
.glance .card .option { font-size: 0.95rem; overflow-wrap: anywhere; }
.glance .card .room-sm { color: var(--accent); font-weight: 700; }
.glance .closing, .glance .big { text-align: center; }
.glance .big { font-size: 1.6rem; }

/* slot + browse header link */
.slot h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 1rem 1rem 0.25rem;
}
.slot .events .room { font-size: 1.15rem; }
.bar { display: flex; align-items: baseline; justify-content: space-between; }
.bar .now-link, .bar a { color: var(--accent); text-decoration: none; min-height: 40px; }
```

- [ ] **Step 6: Verify**

```bash
node --test tests/
node --check app/js/views/glance.js && node --check app/js/views/slot.js && node --check app/js/main.js && node --check app/js/views/browse.js && echo SYNTAX-OK
```

Expected: 39 tests PASS, `SYNTAX-OK`. HTTP smoke: serve repo root (`uv run python -m http.server 8123`), curl `app/`, `app/js/glance.js`, `app/js/views/glance.js` → 200 each, kill server.

- [ ] **Step 7: Commit**

```bash
git add app/
git commit -m "feat: glance and slot views with live clock"
```

---

## Manual QA (after all tasks — human, real browser; the `?at=` override makes the past conference testable)

Serve repo root, then:

1. `http://localhost:8123/app/?url=/conferences/fagfestival-2026.json&at=2026-08-26T09:30:00%2B02:00` — glance shows **Now: Fellesareal / registration** (solo auto-show), Next = keynote. Room name is visually the largest text. No scrolling.
2. `…&at=2026-08-26T11:30:00%2B02:00` with nothing picked — "Nothing picked" card listing options; tap → slot detail with all six parallel sessions, room-first rows; set a pick there; back (`‹ Now`) → glance shows it.
3. Pick two overlapping sessions from browse; glance at that time shows the latest pick.
4. `…&at=2026-08-26T08:00:00%2B02:00` → "First up" (before phase); `…&at=2026-08-27T10:00:00%2B02:00` → closing state.
5. Avoid a solo anchor (lunch), `at` during lunch → "Nothing picked" (avoided never surfaces).
6. Without `?at=`: glance renders (after phase for this conference) and the ☰ corner opens browse; browse "Now" link returns.
7. Leave glance open ≥30 s with `?at=` absent — no console errors from the tick.
