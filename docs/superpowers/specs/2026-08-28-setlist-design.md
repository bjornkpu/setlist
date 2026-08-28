# setlist — design

Date: 2026-08-28
Status: approved design, pre-implementation
Source requirements: `docs/REQUIREMENTS.md` (authoritative for scope; this document records the decisions made on top of it)

## Decisions made during brainstorming

These resolve the ambiguities the requirements left open. Glossary terms are in `CONTEXT.md`.

1. **Overlap is pairwise.** Two events conflict when their time ranges intersect. There is no global slot grid derived from `timeslot_duration`. The "slot" of an event E is the set of events overlapping E's range.
2. **Solo events auto-show.** An event that is the only thing running during its time range is the destination for that time, without a pick. This is how anchors (lunch, keynote, registration) surface in the glance view with zero user effort — the rule is about overlap, not about the `Fellesareal` room name. An anchor that overlaps real sessions behaves like an ordinary event.
3. **Active schedule** is auto-selected when a cached schedule's date range covers today; otherwise the last used one. Manually switchable in the library.
4. **Target platform:** Android phone + desktop Edge (both Chromium). iOS Safari is not a test target.
5. **UI language:** English (chrome text only; schedule content renders as-is).
6. **Navigation:** the glance view stays chrome-free except one small corner icon opening browse. Tapping the Now/Next card opens slot detail (per requirements). Library is reached from browse.
7. **Hosting:** GitHub Pages serving the whole repo. App at `/setlist/app/`, default provider at `https://bjornkpu.github.io/setlist/conferences/` — same origin, so the default provider never hits CORS.
8. **Tests:** `node --test` on pure logic modules; Python `unittest` for the validator. No DOM/UI test automation.
9. **Removing a provider keeps its cached schedules.** Schedules are removed individually, with confirmation.
10. **Avoided sessions are dimmed** in browse, never hidden.
11. **Pick conflict:** the new pick replaces the old immediately; an undo toast names the replaced session.

## Architecture

Hash-routed view modules. No framework, no build step (requirements §3).

```text
app/
  index.html          # shell + view containers
  manifest.json
  sw.js
  css/app.css
  js/
    main.js           # boot, hash router, clock tick
    schedule.js       # frab JSON -> normalized model (pure)
    plan.js           # plan states + conflict logic (pure)
    glance.js         # now/next resolution (pure)
    db.js             # IndexedDB promise wrapper
    settings.js       # localStorage wrapper
    providers.js      # provider fetch/resolve, upcoming/past split
    views/
      glance.js
      browse.js
      event.js        # session detail incl. abstract, state buttons
      slot.js         # slot detail: picks, maybes, rest of slot
      library.js      # cached schedules, providers, add/remove/reload
```

Routes: `#/` (glance), `#/browse`, `#/event/:key`, `#/slot/:key`, `#/library`.

`schedule.js`, `plan.js`, `glance.js` are DOM-free so node runs them directly.

### Data flow

One-way: IndexedDB → normalize → in-memory state → render. A mutation (setting a plan state) goes through `plan.js`, persists, then re-renders the current view. Data is small (hundreds of events), so every render is a full re-render of the active view — no diffing. Rendering is template strings via `innerHTML`; all schedule-sourced text is HTML-escaped.

### Normalized model

Parsing happens once per load. Each event gets:

- `key` — `guid`, falling back to `id` (string-coerced). Plan entries key on this.
- `start`, `end` — epoch milliseconds. `end` is computed from `start` + `duration` (`HH:MM`, per frab). The event's `date` field (ISO 8601 with offset) is the time source; `day_start`/`day_end` group days.
- `room`, `title`, `subtitle`, `track`, `type`, `persons[]`, `abstract`, `description`, `links[]` — missing optional fields become empty string/array, never undefined errors.

## Glance resolution

Pure function `resolveGlance(events, plan, now)`:

- **Destination of a time range:** an overlapping `pick` if one exists; else an overlapping solo event; else null.
- **Now** = destination among events with `start <= now < end`.
- **Next**: take the earliest-starting non-avoided upcoming event; its slot (all events overlapping it) is the next slot. If the next slot contains a pick or a solo event, that is Next. Otherwise the glance says plainly that nothing is picked and lists the next slot's maybes first, then the rest of the slot (requirements §5.1).
- Before the first event of the day: show the first item. After the last end: closing state.
- Countdown shows time until next start. The view re-renders on a 30-second tick and on `visibilitychange`.

Display rules (requirements §5.1): room name is the largest text, larger than the title. No scrolling.

## Persistence

IndexedDB database `setlist`, three object stores:

| Store | Key | Value |
| --- | --- | --- |
| `schedules` | source URL | `{url, json, title, start, end, loadedAt}` |
| `plans` | source URL | `{entries: {eventKey: 'pick'\|'maybe'\|'avoid'}}` |
| `providers` | provider URL | `{url, name}` |

One plan record per schedule; entries absent = state "none". Reloading a schedule refetches and replaces `json` only — the plan record is untouched, and guid-based keys make entries survive upstream edits. Removing a schedule deletes both its records, after confirmation. Every state change persists immediately.

localStorage: active schedule URL and minor UI preferences.

## Offline & providers

- `sw.js` precaches the app shell (explicit file list, manually bumped version string per change), cache-first. `skipWaiting` + `clients.claim` on update.
- Schedule and provider fetches are network-only from the SW's perspective; offline availability comes from IndexedDB, not the HTTP cache.
- A fetch `TypeError` (CORS or offline) produces a specific message and offers `<input type="file">` import as fallback. Network failure never blocks the glance view, which reads IndexedDB only.
- Provider resolution: if the URL does not end in `.json`, append `/index.json`. Relative schedule `url`s resolve against the index URL via `new URL(rel, base)`. Unknown index fields are ignored. Upcoming/past split compares `end` to today.
- One default provider ships, pointing at this repo's `conferences/` on GitHub Pages; removable like any other.
- `?url=` loads that schedule, caches it, activates it, then strips the parameter with `history.replaceState`.

## Tooling (`tools/`, Python stdlib only)

- `validate.py <schedule.json>` — all checks from requirements §6.1. Output grouped ERROR/WARN, each with a JSON-path-style location and expected-vs-found, specific enough to paste back into an LLM. Exit code 1 on any error.
- `gen_index.py <dir>` — scans schedule files, writes `index.json`. Run manually, commit the result.
- `EXTRACTION_PROMPT.md` — prompt template for turning a program (PDF/web) into `schedule.json`, embedding the schema and validator constraints.

## Errors & testing

- `tests/*.test.js` at repo root, run with `node --test tests/`. Covers `schedule.js` (parsing, duration math, defensive defaults), `plan.js` (conflict replacement), `glance.js` (destination resolution, solo rule, boundaries).
- `tools/test_validate.py` — stdlib `unittest`; fixtures: the real Fagfestival schedule (known good) plus deliberately broken variants per validator check.
- Runtime errors render as an inline message in the affected view. An unparseable schedule is reported (what/where) and not cached.

## First schedule data

Fagfestival 2026 program source: `https://crayonconsulting.no/vev/fagfestivalen` (content lives in a Vev embed; extracted text captured during design). 2026-08-26, ODEON Oslo, 42 sessions, 6 tracks ("Spor 1 – Woodstack", …), anchors: registration 09:00, keynote 10:00–10:50, dinner 17:00 at MAMMAS PIZZA. Anchors go in room `Fellesareal`.

## Build order

Unchanged from requirements §8: schedule + validator → browse → persistence → glance → service worker → providers → second/third conference. Each step lands working before the next starts. Tasks tracked in beads.
