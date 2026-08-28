# setlist — requirements

> A conference companion PWA optimised for one question:
> **where do I go next?**

This document is the starting point for implementation. It is written to be
read by an LLM bootstrapping the project, so it states constraints explicitly
rather than leaving them to taste.

---

## 1. Context

Conference programs are built for browsing *before* the event: long abstracts,
six parallel tracks, marketing typography. They are poor at resolving *during*
the event, when you are in a stairwell with four minutes left and need one room
name.

Existing tools each solve part of it:

- **Giggity** (Android) — generic, loads frab/pretalx formats, feature-rich,
  dated interface.
- **Skedz** (PWA) — offline-first, client-side only, modern; personalisation is
  a flat "like" list.
- **Conference-native apps** (TrondheimDC, NDC) — a star/favourite toggle,
  locked to one event.

All three share the same limitation: **favourites are a flat set.** Star three
sessions in one time slot and none of them can tell you which one you are
actually attending. Resolving that is the point of this project.

## 2. Goals

1. Answer "where do I go next" in a single glance, with no scrolling and no
   navigation.
2. Let the user express a real decision per time slot, not just a favourite.
3. Work with no network connection.
4. Consume schedules that already exist in an open format.
5. Let anyone host their own collection of schedules.

### Non-goals

Explicitly out of scope. Do not implement these.

- Accounts, login, user identity
- Any backend service, API, or database
- Sync between devices
- Social features: sharing, ratings, comments, attendee lists
- Editing schedule *content* in the app (schedules are edited in git)
- Maps or indoor navigation
- Note-taking during sessions
- Calendar sync

## 3. Constraints

| Constraint | Value |
|---|---|
| Name | `setlist` |
| Users | One (the author). Others may use it; nothing is designed for them. |
| Stack | Plain HTML, CSS and JavaScript. No framework, no build step, no bundler. |
| Modules | Native ES modules (`<script type="module">`) |
| Backend | None |
| Storage | IndexedDB for schedules, localStorage for settings |
| Hosting | Any static file host |
| Licence | AGPL-3.0 (matches Skedz, the closest prior art) |

**On the stack:** the no-build constraint is deliberate and should be respected
even where a framework would be convenient. It keeps the project debuggable from
a phone browser and removes the dependency treadmill. If the project outgrows
it, refactoring to Vite + TypeScript is a later decision — do not pre-empt it
by adding a build step now.

The service worker requires the app to be served over HTTP(S). Opening
`index.html` via `file://` will not work.

## 4. Data formats

### 4.1 Schedules

The app consumes **frab-compatible `schedule.json`** — the format produced by
frab, pretalx, and Pentabarf, and consumed by Skedz and Giggity.

This is a hard compatibility requirement: schedule files produced for setlist
must remain loadable in Skedz and Giggity. Do not extend the format with
non-standard fields.

Structure (abbreviated):

```
schedule
  version
  conference
    title, acronym, start, end, days, timeslot_duration, time_zone_name
    rooms[]                    # may be a list of names or of objects
  conference.days[]
    index, date, day_start, day_end
    rooms                      # map: room name -> array of events
      "Sal 6": [
        {
          guid, id, date, start, duration, room, slug,
          title, subtitle, track, type, language,
          abstract, description,
          persons: [{id, public_name}],
          links[], attachments[]
        }
      ]
```

Notes for implementers:

- `start` is `HH:MM` and `duration` is `HH:MM` — not minutes, and not an end
  time. Compute end times.
- `date` on an event is a full ISO 8601 timestamp with offset.
- Days are keyed by `index` and `date`; a conference day may cross midnight, so
  `day_start`/`day_end` are authoritative for grouping, not calendar date.
- Room ordering is not guaranteed meaningful.
- Real-world files are inconsistent. Parse defensively; missing optional fields
  must not break rendering.

### 4.2 Rooms and floors

Frab's `room` is a flat name string. It has no concept of floor or building.

**v1 does not model floors.** Multi-floor wayfinding was considered and
deliberately deferred: it would require either a non-standard extension or a
separate venue file, and it would break the compatibility requirement above.
The room name is displayed verbatim, so a schedule author who cares can write
`Sal 6 (1. et.)` as the room name.

Do not invent a floor field.

### 4.3 Anchors

Non-session events — registration, keynote, lunch, breaks, the closing session,
dinner — are first-class in the timeline. They are most of the day's actual
navigation.

Frab has no concept of these, so **they are represented as ordinary events** in
a shared room (convention: `Fellesareal`, following TrondheimDC). They may have
no speaker and no abstract.

The app must therefore handle events with empty `persons`, empty `abstract`,
and a room that is not a real track room. It must not filter them out.

### 4.4 Providers

A **provider** is a URL pointing at a collection of schedules. Users add
providers; each provider offers a list of events to load.

A provider is a static host serving an `index.json`:

```json
{
  "version": "1.0",
  "name": "BK's conferences",
  "schedules": [
    {
      "id": "fagfestival-2026",
      "title": "Fagfestival 2026",
      "start": "2026-08-26",
      "end": "2026-08-26",
      "url": "fagfestival-2026.json"
    }
  ]
}
```

- `url` may be relative to the index, or absolute.
- `start`/`end` are ISO dates. They exist so the app can separate upcoming from
  past events without downloading every schedule.
- Unknown fields must be ignored, not rejected.

**Why an index file rather than listing a GitHub directory:** `raw.
githubusercontent.com` cannot list directories. The GitHub contents API can,
but it is rate-limited to 60 requests/hour unauthenticated and returns
filenames without dates — which makes upcoming/past filtering impossible. A
generated index file avoids both problems and works on any static host, not
just GitHub.

Provider resolution: given a provider URL, the app fetches `<url>/index.json`
if the URL does not already end in `.json`.

One default provider ships with the app, pointing at the author's schedule
repository. It is removable like any other.

### 4.5 The plan

The user's choices. **Local only** — IndexedDB, never uploaded, never in a
schedule file, never synced.

Per event id, one of three states:

- `pick` — I am attending this
- `maybe` — a fallback if the pick falls through (unordered)
- `avoid` — actively rejected; suppress it

At most one `pick` per overlapping time range. Selecting a second pick in the
same range replaces the first — with visible feedback, not silently.

`maybe` and `avoid` are unbounded. `avoid` exists so a rejected session stays
rejected across sessions of use; it is never surfaced in the glance view.

Plan entries key on event `guid` (falling back to `id`), so re-importing an
updated schedule preserves the plan.

## 5. Functional requirements

### 5.1 Glance view — the primary screen

The app opens here whenever a schedule is loaded and the current time falls
within the event.

Shows:

- **Now** — the picked session currently running: room name, title, end time
- **Next** — the next picked session: start time, room name, title
- Time remaining until the next session starts

Rules:

- **Room name is the largest text on screen.** Larger than the title. The user
  already knows why they picked it; they do not know where it is.
- No scrolling. No navigation chrome. It fits on one phone screen.
- Anchors appear here like any other session. Lunch is a destination.
- If no pick exists for the current or next slot, say so plainly and offer the
  `maybe` list for that slot, then the full slot.
- Before the event starts: show the first item of the day.
- After the event ends: show the last item, or a closing state.
- The view updates as time passes without a manual refresh.
- One tap reaches the slot detail: picks, maybes, and the rest of that slot,
  each with its room.

### 5.2 Browse view

The full program.

- Grouped by day, then ordered by start time
- Multi-day events must work: a day selector, defaulting to today if today is
  one of the event days
- Each session shows time, room, title, speaker, and its plan state
- Filter by: day, room, track, search text
- Tapping a session opens its detail, including the abstract

### 5.3 Selecting

From browse or from session detail, the user sets a session's state:
pick / maybe / avoid / none.

- Conflicts (a second pick in an overlapping range) are surfaced immediately
- State is visible in list views without opening a session
- Changes persist instantly; there is no save action

### 5.4 Schedule management

- Add a provider by URL; list its schedules, split into upcoming and past
- Load a schedule from a provider, or directly by URL
- Loaded schedules are cached in IndexedDB and listed in a library
- Reload a schedule to pick up upstream changes; the plan survives
- Remove a schedule, and its plan, with confirmation
- `?url=` parameter loads a schedule directly (matching Skedz's convention, so
  links are interchangeable)

### 5.5 Offline

- The app shell is cached by a service worker and starts with no network
- Schedules load from IndexedDB when offline
- Every screen except adding a new schedule works fully offline
- Network failure is reported clearly and never blocks the glance view

CORS: some schedule endpoints will refuse browser requests. When a fetch fails
for CORS reasons, say so specifically and offer file import as a fallback. Do
not silently fail.

## 6. Tooling

A `tools/` directory, separate from the app. Python is fine here; the no-build
constraint applies only to the app.

### 6.1 Validator (required)

Schedules are produced by an LLM from a conference PDF or web page as a first
pass, then hand-corrected. The validator is what makes that workflow safe, and
it is not optional.

It must check:

- Structural conformance to frab `schedule.json`
- `duration` is `HH:MM`, not minutes, not an end time (the most likely LLM error)
- `date` timestamps agree with the day they are nested under
- Every event has a unique `guid` and `id`
- Room names are consistent (no `Sal 6` and `sal 6` in the same file)
- Overlapping events within a single room — usually a mistake
- `days[].date` matches `conference.start`/`end` and `days` count
- Warn on: empty titles, missing speakers outside `Fellesareal`, suspiciously
  long durations, sessions outside `day_start`/`day_end`

Output must be specific enough to paste back into an LLM as a correction prompt.

### 6.2 Index generator

Scans a directory of schedule files, extracts title and dates from each, writes
`index.json`. Run manually and commit the result — no CI, no bot commits.

### 6.3 Extraction prompt

A documented prompt template for turning a conference program into
`schedule.json`, including the schema and the constraints the validator checks.
Kept in the repo alongside the tools.

## 7. Repository layout

```
setlist/
  app/                   # the PWA — plain HTML/CSS/JS
    index.html
    sw.js
    manifest.json
    css/
    js/
  conferences/           # schedule.json files + index.json
  tools/                 # validator, index generator, extraction prompt
  README.md
```

The app is deployable by copying `app/` to any static host. The `conferences/`
directory is servable as a provider from the same repo via raw file URLs.

## 8. Build order

Each step is independently useful; do not start the next until the previous
works.

1. **Schedule + validator.** Hand-write or LLM-generate one real conference
   (Fagfestival 2026 — single day, 6 tracks, 42 sessions), and build the
   validator against it. This tests the schema before any UI exists.
2. **Browse view.** Load a schedule from a URL, render the program, group by
   day. No persistence yet.
3. **Persistence.** IndexedDB for schedules, plan state, selection UI.
4. **Glance view.** The payoff. Everything before this was groundwork.
5. **Service worker.** Offline shell and cached schedules.
6. **Providers.** Index format, add/remove, upcoming/past split.
7. **Second and third conference.** TrondheimDC (rooms vary per session, no
   tracks) and NDC Oslo (multi-day) are the real schema tests.

## 9. Open questions

Deliberately unresolved. Decide when they bite, not before.

- Notifications/reminders before a picked session — Skedz has them; unclear
  whether they beat just looking at the phone.
- Floor-aware transitions — deferred from v1 (§4.2). Revisit only with a
  concrete plan for where floor data lives that does not break frab
  compatibility.
- Whether `maybe` should become ordered. Start unordered; add ordering only if
  choosing between maybes in the moment proves slow.
- Exporting picks to iCal.
