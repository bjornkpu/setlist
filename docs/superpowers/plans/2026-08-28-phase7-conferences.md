# Phase 7: More Conferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TrondheimDC 2026 (rooms vary per session, no tracks) and NDC Oslo 2026 (multi-day) as real schema tests, plus the cross-view day-drift fix that multi-day data makes observable — build order step 7 of `docs/REQUIREMENTS.md` §8, the final phase.

**Architecture:** TrondheimDC publishes through Sessionize, whose `view/All` API is clean JSON — a small tested converter (`tools/sessionize_to_frab.py`) beats LLM extraction for structured input and is reusable for future Sessionize conferences. NDC Oslo's agenda is server-rendered HTML day pages — that one goes through the LLM-extraction workflow the tools were built for. Both files must pass `validate.py` before `gen_index.py` regenerates the committed index (**ordering: validate → gen_index → commit** — the drift test enforces the regeneration). The app change is small: glance keeps `browse.dayIndex` following the current/next day unless the user pinned a day manually.

**Tech Stack:** Python stdlib (converter), plain JS. No dependencies, no build.

**Spec:** `docs/superpowers/specs/2026-08-28-setlist-design.md` (`docs/REQUIREMENTS.md` §4.1–4.3, §8 step 7)

## Global Constraints

- Both new schedules must be strictly frab-compatible — the same 17-field event template as `conferences/fagfestival-2026.json`, no invented fields. Anchors are ordinary events; the solo rule keys on overlap, not room names, so venue-real room names are kept verbatim (TrondheimDC's own "Fellesareal" included).
- guid: `uuid5(NAMESPACE_URL, "setlist/<acronym>/<stable-source-id>")` — deterministic so re-conversion/re-extraction preserves plans.
- Ordering per file: `uv run python tools/validate.py conferences/<file>.json` reports **0 errors** (warnings allowed but must be read and judged) BEFORE `uv run python tools/gen_index.py conferences` regenerates the index, and both are committed together. `tools/test_gen_index.py` fails if the committed index drifts.
- Sessionize times are venue-local WITHOUT offset; the converter takes `--offset`. Oslo/Trondheim in September/October 2026 = CEST = `+02:00`.
- Python stdlib only, run via `uv run python`. JS suite `node --test tests/` must stay green; edited shell files force a `VERSION` re-hash (the sw test prints the value).
- Kill any process you start by PID only — NEVER `taskkill //IM`.
- Commits: Conventional Commits, subject ≤ 50 chars.

---

### Task 1: Capture sources

**Files:**
- Create: `tools/sources/trondheimdc-2026-sessionize.json`
- Create: `tools/sources/ndc-oslo-2026-day1.txt`, `-day2.txt`, `-day3.txt`

**Interfaces:**
- Produces: the raw inputs Tasks 2–4 consume. Data capture only.

- [ ] **Step 1: TrondheimDC Sessionize export**

```bash
curl -sL "https://sessionize.com/api/v2/1diujeu9/view/All" -o tools/sources/trondheimdc-2026-sessionize.json
```

Sanity: `uv run python -c "import json; d=json.load(open('tools/sources/trondheimdc-2026-sessionize.json', encoding='utf-8')); print(len(d['sessions']), len(d['rooms']))"` — expected `45 7` (or close; the event is live, counts may shift by a session or two).

- [ ] **Step 2: NDC Oslo day pages → text**

The controller already captured the three raw HTML pages in the session scratchpad; prefer them (stable snapshot). Copy and strip:

```bash
SCRATCH="C:/Users/BjornKristian.Punsvi/AppData/Local/Temp/claude/C--Users-BjornKristian-Punsvi-personal-setlist/cd0e9ef9-cb59-4b48-ba70-0344c3eeedcf/scratchpad"
for n in 1 2 3; do
  uv run python -c "
import re, html, sys
n = '$n'
src = '$SCRATCH/ndc-d' + n + '.html'
t = open(src, encoding='utf-8', errors='replace').read()
t = re.sub(r'<(script|style)[\s\S]*?</\1>', '\n', t)
t = re.sub(r'<[^>]+>', '\n', t)
t = html.unescape(t)
t = re.sub(r'[ \t]+', ' ', t)
t = re.sub(r'\n\s*\n+', '\n', t)
open('tools/sources/ndc-oslo-2026-day' + n + '.txt', 'w', encoding='utf-8').write(t)
"
done
```

If the scratchpad files are gone, refetch first: `curl -sL "https://ndcoslo.com/agenda/2026-09-16" -o <scratch>/ndc-d1.html` (and `-17` → d2, `-18` → d3).

Sanity: `grep -c "Room" tools/sources/ndc-oslo-2026-day1.txt` — nonzero; the files contain time strings like `09:00` and room names `Room 1`–`Room 7`/`Expo`.

- [ ] **Step 3: Commit**

```bash
git add tools/sources/
git commit -m "chore: capture TDC and NDC 2026 program sources"
```

---

### Task 2: `sessionize_to_frab.py` converter (TDD)

**Files:**
- Create: `tools/sessionize_to_frab.py`
- Test: `tools/test_sessionize_to_frab.py`

**Interfaces:**
- Produces: `convert(data, title, acronym, offset, tz_name) -> frab_root_dict`; CLI `uv run python tools/sessionize_to_frab.py <in.json> --title T --acronym A --offset +02:00 --tz-name Europe/Oslo --out <out.json>`.
- Mapping: sessions with both `startsAt`/`endsAt` only; grouped into days by local date; `duration` = end − start as HH:MM; `room` via `roomId` → rooms[].name (fallback `"TBA"`); `guid` = uuid5 recipe on the Sessionize session id; `id` = int(session id) when numeric else running number; Sessionize `description` → `abstract`; `persons` via speaker GUIDs → fullName with stable sequential integer ids (same speaker ⇒ same id); `track`/`subtitle`/`language` empty; `day_start`/`day_end` = that day's earliest start / latest end; `conference.rooms` = Sessionize room order filtered to rooms actually used.

- [ ] **Step 1: Write the failing tests**

Create `tools/test_sessionize_to_frab.py`:

```python
import json
import unittest
from pathlib import Path

from sessionize_to_frab import convert


def fixture():
    return {
        "sessions": [
            {"id": "101", "title": "Talk A", "description": "About A",
             "startsAt": "2026-10-19T09:00:00", "endsAt": "2026-10-19T09:45:00",
             "isServiceSession": False, "speakers": ["sp-1"], "roomId": 1},
            {"id": "102", "title": "Registration", "description": None,
             "startsAt": "2026-10-19T08:00:00", "endsAt": "2026-10-19T09:00:00",
             "isServiceSession": True, "speakers": [], "roomId": 2},
            {"id": "103", "title": "Day 2 talk", "description": "",
             "startsAt": "2026-10-20T10:00:00", "endsAt": "2026-10-20T11:30:00",
             "isServiceSession": False, "speakers": ["sp-1", "sp-2"], "roomId": 1},
            {"id": "104", "title": "Unscheduled", "startsAt": None, "endsAt": None,
             "speakers": [], "roomId": None},
        ],
        "speakers": [
            {"id": "sp-1", "fullName": "Kari Nordmann"},
            {"id": "sp-2", "fullName": "Ola Nordmann"},
        ],
        "rooms": [{"id": 2, "name": "Fellesareal"}, {"id": 1, "name": "Aurora"}],
        "questions": [], "categories": [],
    }


class ConvertTests(unittest.TestCase):
    def setUp(self):
        self.conf = convert(fixture(), "Test Conf", "tc26", "+02:00", "Europe/Oslo")["schedule"]["conference"]

    def test_conference_frame(self):
        self.assertEqual(self.conf["title"], "Test Conf")
        self.assertEqual(self.conf["start"], "2026-10-19")
        self.assertEqual(self.conf["end"], "2026-10-20")
        self.assertEqual(self.conf["daysCount"], 2)
        self.assertEqual(self.conf["time_zone_name"], "Europe/Oslo")
        self.assertEqual(self.conf["rooms"], ["Fellesareal", "Aurora"])  # sessionize order, used only

    def test_events_and_days(self):
        day1 = self.conf["days"][0]
        self.assertEqual(day1["index"], 0)
        self.assertEqual(day1["date"], "2026-10-19")
        self.assertEqual(day1["day_start"], "2026-10-19T08:00:00+02:00")
        self.assertEqual(day1["day_end"], "2026-10-19T09:45:00+02:00")
        talk = day1["rooms"]["Aurora"][0]
        self.assertEqual(talk["id"], 101)
        self.assertEqual(talk["start"], "09:00")
        self.assertEqual(talk["duration"], "00:45")
        self.assertEqual(talk["date"], "2026-10-19T09:00:00+02:00")
        self.assertEqual(talk["abstract"], "About A")
        self.assertEqual(talk["persons"], [{"id": 1, "public_name": "Kari Nordmann"}])
        reg = day1["rooms"]["Fellesareal"][0]
        self.assertEqual(reg["persons"], [])
        self.assertEqual(reg["duration"], "01:00")
        self.assertEqual(reg["abstract"], "")

    def test_speaker_ids_stable_and_unscheduled_dropped(self):
        day2 = self.conf["days"][1]
        talk = day2["rooms"]["Aurora"][0]
        self.assertEqual(talk["duration"], "01:30")
        self.assertEqual(talk["persons"][0], {"id": 1, "public_name": "Kari Nordmann"})
        self.assertEqual(talk["persons"][1], {"id": 2, "public_name": "Ola Nordmann"})
        total = sum(len(v) for d in self.conf["days"] for v in d["rooms"].values())
        self.assertEqual(total, 3)  # unscheduled session dropped

    def test_guid_deterministic(self):
        again = convert(fixture(), "Test Conf", "tc26", "+02:00", "Europe/Oslo")["schedule"]["conference"]
        g1 = self.conf["days"][0]["rooms"]["Aurora"][0]["guid"]
        g2 = again["days"][0]["rooms"]["Aurora"][0]["guid"]
        self.assertEqual(g1, g2)
        self.assertEqual(len({g1, self.conf["days"][0]["rooms"]["Fellesareal"][0]["guid"]}), 2)


class RealPayloadTests(unittest.TestCase):
    def test_real_tdc_payload_validates_clean(self):
        src = Path(__file__).resolve().parent / "sources" / "trondheimdc-2026-sessionize.json"
        data = json.loads(src.read_text(encoding="utf-8"))
        root = convert(data, "Trondheim Developer Conference 2026", "tdc2026", "+02:00", "Europe/Oslo")
        import validate
        report = validate.validate(root)
        self.assertEqual([f for f in report.findings if f[0] == "ERROR"], [], report.render())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run python -m unittest discover -s tools -v`
Expected: converter tests FAIL (module missing); everything else passes.

- [ ] **Step 3: Create `tools/sessionize_to_frab.py`**

```python
#!/usr/bin/env python3
"""Convert a Sessionize "view/All" JSON payload to frab schedule.json.

Sessionize is what TrondheimDC (and many other conferences) publish through:
https://sessionize.com/api/v2/<event-id>/view/All
Times in that payload are venue-local WITHOUT an offset; pass --offset.
Output should be checked with tools/validate.py before committing.

Usage:
  uv run python tools/sessionize_to_frab.py tools/sources/tdc.json --title "TDC 2026" --acronym tdc2026 --offset +02:00 --tz-name Europe/Oslo --out conferences/trondheimdc-2026.json
"""
import argparse
import json
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path


def slugify(text, limit=40):
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:limit].rstrip("-") or "session"


def convert(data, title, acronym, offset, tz_name):
    room_names = {r["id"]: r["name"] for r in data.get("rooms", [])}
    speaker_names = {s["id"]: s["fullName"] for s in data.get("speakers", [])}
    person_ids = {}

    def person(speaker_guid):
        name = speaker_names.get(speaker_guid) or ""
        if name not in person_ids:
            person_ids[name] = len(person_ids) + 1
        return {"id": person_ids[name], "public_name": name}

    scheduled = [s for s in data.get("sessions", []) if s.get("startsAt") and s.get("endsAt")]
    scheduled.sort(key=lambda s: (s["startsAt"], str(s.get("id"))))

    by_date = {}
    for i, s in enumerate(scheduled, start=1):
        start_dt = datetime.fromisoformat(s["startsAt"])
        end_dt = datetime.fromisoformat(s["endsAt"])
        minutes = int((end_dt - start_dt).total_seconds() // 60)
        sid = str(s.get("id", i))
        num_id = int(sid) if sid.isdigit() else i
        event = {
            "guid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"setlist/{acronym}/{sid}")),
            "id": num_id,
            "date": f"{start_dt.isoformat()}{offset}",
            "start": f"{start_dt:%H:%M}",
            "duration": f"{minutes // 60:02d}:{minutes % 60:02d}",
            "room": room_names.get(s.get("roomId"), "TBA"),
            "slug": f"{acronym}-{num_id}-{slugify(s.get('title'))}",
            "title": s.get("title") or "",
            "subtitle": "",
            "track": "",
            "type": "session",
            "language": "",
            "abstract": s.get("description") or "",
            "description": "",
            "persons": [person(pid) for pid in s.get("speakers") or []],
            "links": [],
            "attachments": [],
        }
        by_date.setdefault(start_dt.date().isoformat(), []).append((event, start_dt, end_dt))

    days = []
    for di, date in enumerate(sorted(by_date)):
        entries = by_date[date]
        rooms = {}
        for event, _, _ in entries:
            rooms.setdefault(event["room"], []).append(event)
        days.append({
            "index": di,
            "date": date,
            "day_start": f"{min(sd for _, sd, _ in entries).isoformat()}{offset}",
            "day_end": f"{max(ed for _, _, ed in entries).isoformat()}{offset}",
            "rooms": rooms,
        })

    used = {e["room"] for d in days for lst in d["rooms"].values() for e in lst}
    conf_rooms = [r["name"] for r in data.get("rooms", []) if r["name"] in used]
    conf_rooms += sorted(used - set(conf_rooms))

    return {
        "schedule": {
            "version": "1.0",
            "conference": {
                "title": title,
                "acronym": acronym,
                "start": min(by_date) if by_date else "",
                "end": max(by_date) if by_date else "",
                "daysCount": len(days),
                "timeslot_duration": "00:05",
                "time_zone_name": tz_name,
                "rooms": conf_rooms,
                "days": days,
            },
        }
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", help="Sessionize view/All JSON file")
    ap.add_argument("--title", required=True)
    ap.add_argument("--acronym", required=True)
    ap.add_argument("--offset", default="+02:00", help="venue UTC offset, e.g. +02:00")
    ap.add_argument("--tz-name", default="Europe/Oslo")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    data = json.loads(Path(args.source).read_text(encoding="utf-8"))
    root = convert(data, args.title, args.acronym, args.offset, args.tz_name)
    Path(args.out).write_text(json.dumps(root, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n = sum(len(v) for d in root["schedule"]["conference"]["days"] for v in d["rooms"].values())
    print(f"wrote {args.out} ({n} event(s), {len(root['schedule']['conference']['days'])} day(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `uv run python -m unittest discover -s tools -v`
Expected: all PASS (including `RealPayloadTests` — the real Sessionize payload converts and validates with zero errors; READ any warnings it prints and note them in your report).

- [ ] **Step 5: Commit**

```bash
git add tools/sessionize_to_frab.py tools/test_sessionize_to_frab.py
git commit -m "feat: sessionize to frab converter"
```

---

### Task 3: Generate + commit TrondheimDC 2026

**Files:**
- Create (generated): `conferences/trondheimdc-2026.json`
- Modify (regenerated): `conferences/index.json`

- [ ] **Step 1: Convert**

```bash
uv run python tools/sessionize_to_frab.py tools/sources/trondheimdc-2026-sessionize.json --title "Trondheim Developer Conference 2026" --acronym tdc2026 --offset +02:00 --tz-name Europe/Oslo --out conferences/trondheimdc-2026.json
```

- [ ] **Step 2: Validate (must be BEFORE gen_index)**

```bash
uv run python tools/validate.py conferences/trondheimdc-2026.json
```

Expected: `0 error(s)`. Read every WARN, judge it, list them in your report (missing speakers on breaks in non-"Fellesareal" rooms are expected and fine — the glance solo rule doesn't care about room names).

- [ ] **Step 3: Regenerate the index**

```bash
uv run python tools/gen_index.py conferences
uv run python -m unittest discover -s tools -v   # drift test must pass
node --test tests/                                # real-fixture JS tests unaffected
```

- [ ] **Step 4: Commit (schedule + index together)**

```bash
git add conferences/trondheimdc-2026.json conferences/index.json
git commit -m "feat: add TrondheimDC 2026 schedule"
```

---

### Task 4: Extract + commit NDC Oslo 2026

**Files:**
- Create: `conferences/ndc-oslo-2026.json`
- Modify (regenerated): `conferences/index.json`

**Interfaces:**
- Consumes: `tools/sources/ndc-oslo-2026-day{1,2,3}.txt`, the rules in `tools/EXTRACTION_PROMPT.md`, `tools/validate.py`.
- Known frame: NDC Oslo 2026, Sep 16–18 (Sep 14–15 are workshop days — OUT of scope), Oslo Spektrum area, rooms `Room 1`–`Room 7` + `Expo`; ~60-min talks on a 09:00/10:20/11:40/13:40/15:00/16:20 grid with 20-min breaks; keynote + registration + breaks/lunch/party are anchors.

- [ ] **Step 1: Read all three source files fully and enumerate every session**

For each: day, start time, end time (grid or stated), room, title, speaker(s). Anchors (registration, keynote if roomless, breaks, lunch, party) become ordinary events — put venue-wide ones in a shared room named `Fellesareal` ONLY if the source gives no real room; keep real rooms verbatim. Abstracts are NOT on the day pages — leave `abstract: ""` (optional field; do not fetch 100+ session pages).

- [ ] **Step 2: Write `conferences/ndc-oslo-2026.json`**

Frame: title `NDC Oslo 2026`, acronym `ndcoslo2026`, start `2026-09-16`, end `2026-09-18`, `daysCount: 3`, `time_zone_name: "Europe/Oslo"`, offset `+02:00`, `timeslot_duration "00:05"`. Same 17-field event template as `conferences/fagfestival-2026.json` (open it as the reference). Conventions:
- `id`: sequential integers from 1 across the whole conference, day order.
- `guid`: `uuid.uuid5(uuid.NAMESPACE_URL, f"setlist/ndcoslo2026/{slug-of-title}-{date}")` — title+date is the stable identity here (no source ids). Generate with a one-off python loop.
- `date` = `2026-09-1XT<start>:00+02:00`; `duration` = end − start (`"01:00"` for grid talks).
- Per-day `day_start` = earliest event start, `day_end` = latest end, `days[].index` 0/1/2.
- `persons`: `[{"id": n, "public_name": name}]`, integer ids sequential, SAME id when a speaker appears in several sessions.
- `track: ""` everywhere (NDC day pages don't carry track names), `language: ""`, `abstract: ""` unless the page shows a blurb.

- [ ] **Step 3: Validate (BEFORE gen_index) — fix data until 0 errors**

```bash
uv run python tools/validate.py conferences/ndc-oslo-2026.json
```

Fix the data, not the validator (unless a finding is demonstrably a validator bug — then failing test first, as always). List surviving warnings + your judgment in the report.

- [ ] **Step 4: Regenerate index + full suites**

```bash
uv run python tools/gen_index.py conferences
uv run python -m unittest discover -s tools -v
node --test tests/
```

- [ ] **Step 5: Commit**

```bash
git add conferences/ndc-oslo-2026.json conferences/index.json
git commit -m "feat: add NDC Oslo 2026 schedule"
```

---

### Task 5: Cross-view day follow (the multi-day fix)

**Files:**
- Modify: `app/js/store.js` (browse state gains `dayPinned`)
- Modify: `app/js/views/browse.js` (day tap pins)
- Modify: `app/js/views/glance.js` (glance follows the resolved day when unpinned)
- Modify: `app/sw.js` (VERSION re-hash — three shell files change)

**Interfaces:**
- `state.browse` gains `dayPinned: boolean` (false on every `activate`). Behavior: the glance updates `browse.dayIndex` to the day of the resolved current/next event unless the user explicitly tapped a day in browse this activation.

- [ ] **Step 1: `app/js/store.js`** — in `activate()`, the browse reset line gains the flag:

```js
  state.browse = { dayIndex: defaultDayIndex(model, now()), room: "", track: "", q: "", dayPinned: false };
```

(Also update the initial `state` literal's `browse` object to include `dayPinned: false`.)

- [ ] **Step 2: `app/js/views/browse.js`** — in `wire()`'s day-selector click handler, after `state.browse.dayIndex = Number(b.dataset.day);` add:

```js
    state.browse.dayPinned = true; // user chose a day: glance stops following
```

- [ ] **Step 3: `app/js/views/glance.js`** — in `renderGlance`, right after `const g = resolveGlance(...)`:

```js
  // Keep browse pointed at the day the glance is showing, unless the user
  // pinned a day themselves (multi-day: glance may cross into day 2).
  if (!state.browse.dayPinned) {
    const ref = g.current?.ref ?? g.next?.ref;
    if (ref && ref.dayIndex !== state.browse.dayIndex) state.browse.dayIndex = ref.dayIndex;
  }
```

- [ ] **Step 4: VERSION + verify**

`node --test tests/` → take the new hash from the sw assertion failure, set `VERSION` in app/sw.js, rerun green (46/46). `node --check` on the three edited JS files.

- [ ] **Step 5: Commit**

```bash
git add app/
git commit -m "feat: glance follows the active day unless pinned"
```

---

## Manual QA (after all tasks — human, real browser)

Serve repo root, library → default provider (or local `/conferences`) → both new schedules listed as **Upcoming**:

1. Load TrondheimDC 2026: browse shows 7 real room names, no track filter (no tracks); glance with `?at=2026-10-19T08:30:00%2B02:00` shows registration/solo anchors by overlap, not by room name.
2. Load NDC Oslo 2026: day selector shows three dates, defaults sensibly; `?at=2026-09-16T12:00:00%2B02:00` glances day 1; `?at=2026-09-17…` follows to day 2 — open browse via ☰: it shows day 2 (followed). Tap day 1 in browse, return to glance and back: browse stays on day 1 (pinned).
3. Picks on NDC day 1 and day 3 coexist (no cross-day conflicts).
4. Reload each schedule from the library: plans survive (deterministic guids).
5. Both suites green; `validate.py` on both new files: 0 errors.
