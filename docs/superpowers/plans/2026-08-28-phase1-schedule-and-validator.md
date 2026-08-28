# Phase 1: Schedule + Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a real, valid frab `schedule.json` for Fagfestival 2026 and the Python validator that proves it — build order step 1 of `docs/REQUIREMENTS.md` §8.

**Architecture:** A single-file stdlib-only Python validator (`tools/validate.py`) that loads a schedule, runs a series of check functions each appending `(level, path, message)` findings to a shared `Report`, prints grouped ERROR/WARN lines with JSON-path locations, and exits 1 on any error. The schedule itself is data authored from the captured conference program text.

**Tech Stack:** Python 3.11+ stdlib only (json, re, argparse, datetime, unittest, uuid). No pip installs. This machine enforces `uv`: always run Python as `uv run python …`.

**Spec:** `docs/superpowers/specs/2026-08-28-setlist-design.md` (and `docs/REQUIREMENTS.md` §4.1–4.3, §6.1, §6.3)

## Global Constraints

- Python: stdlib only, run via `uv run python`.
- `schedule.json` must stay strictly frab-compatible — no invented fields (REQUIREMENTS §4.1). Anchors are ordinary events in room `Fellesareal` (§4.3). No floor field (§4.2).
- `duration` and `start` are `HH:MM`. `date` is full ISO 8601 with offset. Norway in August is `+02:00`.
- Validator output must be specific enough to paste into an LLM as a correction prompt: every finding names its JSON path, what was found, and what was expected.
- Commits: Conventional Commits, subject ≤ 50 chars, body only when the why isn't obvious.
- Tests run from repo root: `uv run python -m unittest discover -s tools -v`.

---

### Task 1: Capture the program source text

**Files:**
- Create: `tools/sources/fagfestival-2026-source.txt`

**Interfaces:**
- Produces: the raw program text Task 2 reads. Data capture only — no code.

- [ ] **Step 1: Copy the already-extracted text if it still exists**

The design session extracted the program from the Vev embed into the session scratchpad. Try (Bash tool):

```bash
cp "C:/Users/BjornKristian.Punsvi/AppData/Local/Temp/claude/C--Users-BjornKristian-Punsvi-personal-setlist/cd0e9ef9-cb59-4b48-ba70-0344c3eeedcf/scratchpad/vev-text.txt" tools/sources/fagfestival-2026-source.txt
```

- [ ] **Step 2: If the scratchpad file is gone, refetch**

```bash
curl -sL "https://embed.vev.page/v1/F4XweAQLaa/p7SOL_oZx6Z?target=2b75fa8a-11ad-4eb4-a6b9-b7d7482262e7" -o vev.html
uv run python -c "
import re, html
s = open('vev.html', encoding='utf-8', errors='replace').read()
t = re.sub(r'<[^>]+>', '\n', s)
t = html.unescape(t)
t = re.sub(r'[ \t]+', ' ', t)
t = re.sub(r'\n\s*\n+', '\n', t)
open('tools/sources/fagfestival-2026-source.txt', 'w', encoding='utf-8').write(t)
"
rm vev.html
```

(The embed URL comes from `https://crayonconsulting.no/vev/fagfestivalen`; if it 404s, re-derive it: `curl -sL https://crayonconsulting.no/vev/fagfestivalen | grep -o 'https://embed.vev.page[^"\\]*'`.)

- [ ] **Step 3: Sanity check**

```bash
grep -c "Spor" tools/sources/fagfestival-2026-source.txt
```

Expected: a nonzero count (track headers like "Spor 1 - Woodstack" present).

- [ ] **Step 4: Commit**

```bash
git add tools/sources/fagfestival-2026-source.txt
git commit -m "chore: capture Fagfestival 2026 program source"
```

---

### Task 2: Author `conferences/fagfestival-2026.json`

**Files:**
- Create: `conferences/fagfestival-2026.json`

**Interfaces:**
- Consumes: `tools/sources/fagfestival-2026-source.txt`
- Produces: the schedule file Task 11 validates. Known facts: 2026-08-26, ODEON Oslo, 42 sessions in 6 parallel tracks named "Spor N - <name>", plus anchors: registration 09:00–10:00, keynote 10:00–10:50, closing ~16:30, dinner 17:00–23:00 at MAMMAS PIZZA. Program time markers: 09:00, 10:00, 11:10, 12:00, 12:50, 13:25, 14:00, 14:25, 14:45, 15:20, 15:55, 16:30, 17:30.

- [ ] **Step 1: Read the source text fully and enumerate every session**

Read `tools/sources/fagfestival-2026-source.txt` end to end (skip the leading JS noise). For each session collect: start time, end time (the program shows ranges like `11:10-12:00`), track ("Spor N - <name>", exact spelling), title, speaker name(s), abstract text, any `#hashtag` (use as `track`-adjacent info only if it reads as a track — otherwise ignore). Anchors (registration, keynote, breaks, closing, dinner) have no track: they go in room `Fellesareal`.

- [ ] **Step 2: Write the JSON**

Skeleton — fill `rooms` with the six exact spor names + `Fellesareal`, and one event object per session/anchor:

```json
{
  "schedule": {
    "version": "1.0",
    "conference": {
      "title": "Fagfestival 2026",
      "acronym": "fagfest2026",
      "start": "2026-08-26",
      "end": "2026-08-26",
      "daysCount": 1,
      "timeslot_duration": "00:05",
      "time_zone_name": "Europe/Oslo",
      "rooms": ["Fellesareal", "Spor 1 - …", "Spor 2 - …", "Spor 3 - …", "Spor 4 - …", "Spor 5 - …", "Spor 6 - …"],
      "days": [
        {
          "index": 0,
          "date": "2026-08-26",
          "day_start": "2026-08-26T09:00:00+02:00",
          "day_end": "2026-08-26T23:00:00+02:00",
          "rooms": {
            "Fellesareal": [],
            "Spor 1 - …": []
          }
        }
      ]
    }
  }
}
```

Event object template (all fields present on every event; empty string/array when unknown):

```json
{
  "guid": "<uuid5, see below>",
  "id": 1,
  "date": "2026-08-26T09:00:00+02:00",
  "start": "09:00",
  "duration": "01:00",
  "room": "Fellesareal",
  "slug": "fagfest2026-1-rod-loper-registrering",
  "title": "Rød løper, registrering og mingling",
  "subtitle": "",
  "track": "",
  "type": "session",
  "language": "no",
  "abstract": "",
  "description": "",
  "persons": [],
  "links": [],
  "attachments": []
}
```

Conventions:

- `id`: sequential integers from 1, in day order.
- `guid`: deterministic — `uuid.uuid5(uuid.NAMESPACE_URL, "setlist/fagfestival-2026/<id>")`. Generate the whole list once:

```bash
uv run python -c "
import uuid
for i in range(1, 50):
    print(i, uuid.uuid5(uuid.NAMESPACE_URL, f'setlist/fagfestival-2026/{i}'))
"
```

- `room` = exact spor name for track sessions, `Fellesareal` for anchors; `room` must equal the key of the containing `rooms` map entry.
- `track` = the spor name for sessions, `""` for anchors.
- `duration` = end minus start as `HH:MM` (a `11:10-12:00` session is `"00:50"`).
- `date` = `2026-08-26T<start>:00+02:00`.
- `persons`: `[{"id": <n>, "public_name": "<name>"}]` — assign person ids sequentially, reusing the same id when the same speaker appears twice.
- `abstract` = the short pitch from the program; `description` stays `""` unless the program has a longer text.
- Anchors keep `persons: []`, `abstract` optional (§4.3). Dinner: title `"Middag og fest — MAMMAS PIZZA"`, 17:00, duration `"06:00"`.

- [ ] **Step 3: Machine-check it parses and count events**

```bash
uv run python -c "
import json
d = json.load(open('conferences/fagfestival-2026.json', encoding='utf-8'))
rooms = d['schedule']['conference']['days'][0]['rooms']
total = sum(len(v) for v in rooms.values())
print({k: len(v) for k, v in rooms.items()})
print('total', total)
"
```

Expected: 42 track sessions + anchors (total ≈ 46–50). If the source text yields a different genuine count, the source wins — note it in the commit body.

- [ ] **Step 4: Commit**

```bash
git add conferences/fagfestival-2026.json
git commit -m "feat: add Fagfestival 2026 schedule"
```

---

### Task 3: Validator skeleton + structural check

**Files:**
- Create: `tools/validate.py`
- Test: `tools/test_validate.py`

**Interfaces:**
- Produces (used by Tasks 4–10):
  - `class Report` — `.error(path, msg)`, `.warn(path, msg)`, `.findings: list[tuple[str, str, str]]` (`("ERROR"|"WARN", path, message)`), `.errors` property, `.render() -> str`
  - `parse_hhmm(value) -> timedelta | None`
  - `parse_iso(value) -> datetime | None`
  - `iter_events(conf)` — yields `(path, day, room_name, event)`
  - `check_structure(root, report) -> conf | None`
  - `validate(root) -> Report` — calls every `check_*` in order
  - `main(argv=None) -> int`
- Test helpers (used by all later test tasks): `base_schedule()`, `make_event(eid, start, duration, room, persons=None, title=None)`, `run(root) -> Report`, `paths(report, level="ERROR") -> list[str]`

- [ ] **Step 1: Write the failing tests**

Create `tools/test_validate.py`:

```python
"""Tests for validate.py. Run from repo root:
uv run python -m unittest discover -s tools -v
"""
import unittest

import validate


def make_event(eid, start, duration, room, persons=None, title=None):
    return {
        "guid": f"guid-{eid}",
        "id": eid,
        "date": f"2026-08-26T{start}:00+02:00",
        "start": start,
        "duration": duration,
        "room": room,
        "title": f"Event {eid}" if title is None else title,
        "persons": [] if persons is None else persons,
    }


def base_schedule():
    """Minimal valid one-day schedule: two talks in Sal 1, one anchor."""
    kari = [{"id": 1, "public_name": "Kari Nordmann"}]
    return {
        "schedule": {
            "version": "1.0",
            "conference": {
                "title": "Test Conf",
                "acronym": "test",
                "start": "2026-08-26",
                "end": "2026-08-26",
                "daysCount": 1,
                "time_zone_name": "Europe/Oslo",
                "rooms": ["Sal 1", "Fellesareal"],
                "days": [
                    {
                        "index": 0,
                        "date": "2026-08-26",
                        "day_start": "2026-08-26T08:00:00+02:00",
                        "day_end": "2026-08-26T18:00:00+02:00",
                        "rooms": {
                            "Sal 1": [
                                make_event(1, "10:00", "00:50", "Sal 1", persons=kari),
                                make_event(2, "11:00", "00:50", "Sal 1", persons=kari),
                            ],
                            "Fellesareal": [
                                make_event(3, "12:00", "00:50", "Fellesareal"),
                            ],
                        },
                    }
                ],
            },
        }
    }


def run(root):
    return validate.validate(root)


def paths(report, level="ERROR"):
    return [p for lvl, p, m in report.findings if lvl == level]


class StructureTests(unittest.TestCase):
    def test_valid_schedule_has_no_errors(self):
        self.assertEqual(run(base_schedule()).errors, [])

    def test_missing_conference_is_error(self):
        root = base_schedule()
        del root["schedule"]["conference"]
        self.assertTrue(any("conference" in p for p in paths(run(root))))

    def test_missing_event_duration_is_error(self):
        root = base_schedule()
        del root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["duration"]
        self.assertTrue(
            any(p.endswith("[0].duration") for p in paths(run(root)))
        )

    def test_rooms_not_a_dict_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"] = []
        self.assertTrue(any(p.endswith("].rooms") for p in paths(run(root))))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run python -m unittest discover -s tools -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'validate'`

- [ ] **Step 3: Write the skeleton**

Create `tools/validate.py`:

```python
#!/usr/bin/env python3
"""Validate a frab-compatible schedule.json (checks from docs/REQUIREMENTS.md 6.1).

Output: one line per finding, ERROR/WARN, with a JSON-path location —
specific enough to paste back into an LLM as a correction prompt.
Exit code 1 if any ERROR.

Usage: uv run python tools/validate.py conferences/some-schedule.json
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta

HHMM_RE = re.compile(r"^\d{1,2}:[0-5]\d$")
MINUTES_RE = re.compile(r"^\d+$")
ANCHOR_ROOM = "Fellesareal"
LONG_SESSION = timedelta(hours=3)
REQUIRED_EVENT_FIELDS = ("guid", "id", "date", "start", "duration", "room", "title")


class Report:
    def __init__(self):
        self.findings = []  # (level, path, message)

    def error(self, path, msg):
        self.findings.append(("ERROR", path, msg))

    def warn(self, path, msg):
        self.findings.append(("WARN", path, msg))

    @property
    def errors(self):
        return [f for f in self.findings if f[0] == "ERROR"]

    def render(self):
        lines = [f"{level:5} {path}: {msg}" for level, path, msg in self.findings]
        n_err = len(self.errors)
        lines.append(f"{n_err} error(s), {len(self.findings) - n_err} warning(s)")
        return "\n".join(lines)


def parse_hhmm(value):
    """'HH:MM' string -> timedelta, or None if malformed."""
    if not isinstance(value, str) or not HHMM_RE.match(value):
        return None
    h, m = value.split(":")
    return timedelta(hours=int(h), minutes=int(m))


def parse_iso(value):
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def iter_events(conf):
    """Yield (json_path, day, room_name, event) for every event."""
    for di, day in enumerate(conf.get("days") or []):
        rooms = day.get("rooms")
        if not isinstance(rooms, dict):
            continue
        for room_name, events in rooms.items():
            if not isinstance(events, list):
                continue
            for ei, event in enumerate(events):
                path = f'schedule.conference.days[{di}].rooms["{room_name}"][{ei}]'
                yield path, day, room_name, event


def check_structure(root, report):
    """Return the conference dict, or None if too broken to continue."""
    sched = root.get("schedule") if isinstance(root, dict) else None
    if not isinstance(sched, dict):
        report.error("schedule", "missing or not an object")
        return None
    conf = sched.get("conference")
    if not isinstance(conf, dict):
        report.error("schedule.conference", "missing or not an object")
        return None
    for field in ("title", "start", "end", "days"):
        if field not in conf:
            report.error(f"schedule.conference.{field}", "missing")
    if "days" in conf and not isinstance(conf["days"], list):
        report.error("schedule.conference.days", "not a list")
        return conf
    for di, day in enumerate(conf.get("days") or []):
        for field in ("index", "date", "day_start", "day_end", "rooms"):
            if field not in day:
                report.error(f"schedule.conference.days[{di}].{field}", "missing")
        if "rooms" in day and not isinstance(day["rooms"], dict):
            report.error(
                f"schedule.conference.days[{di}].rooms",
                "not an object mapping room name to a list of events",
            )
    for path, day, room, event in iter_events(conf):
        if not isinstance(event, dict):
            report.error(path, "event is not an object")
            continue
        for field in REQUIRED_EVENT_FIELDS:
            if field == "title":
                continue  # empty title is a warning (check_warnings), not an error
            if event.get(field) in ("", None):
                report.error(f"{path}.{field}", "missing or empty")
    return conf


CHECKS = []  # populated by later tasks: functions (conf, report) -> None


def validate(root):
    report = Report()
    conf = check_structure(root, report)
    if conf is None:
        return report
    for check in CHECKS:
        check(conf, report)
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("schedule", help="path to schedule.json")
    args = ap.parse_args(argv)
    try:
        with open(args.schedule, encoding="utf-8") as f:
            root = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERROR {args.schedule}: {e}")
        return 1
    report = validate(root)
    print(report.render())
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
```

Note the `CHECKS` registry: Tasks 4–10 each add their check function and a `CHECKS.append(...)` line so `validate()` needs no editing per task. Placement rule: insert every new check function (and its `CHECKS.append`) immediately **above** `def validate(` — never below the `if __name__ == "__main__":` guard, which must stay the last thing in the file (code below it never runs before `sys.exit(main())` when invoked as a script).

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run python -m unittest discover -s tools -v`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator skeleton with structural check"
```

---

### Task 4: Duration checks

**Files:**
- Modify: `tools/validate.py` (append)
- Test: `tools/test_validate.py` (append)

**Interfaces:**
- Consumes: `Report`, `parse_hhmm`, `iter_events`, `CHECKS`, test helpers from Task 3
- Produces: `check_durations(conf, report)` registered in `CHECKS`

- [ ] **Step 1: Write the failing tests** (append to `tools/test_validate.py`)

```python
class DurationTests(unittest.TestCase):
    def test_minutes_style_duration_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["duration"] = "50"
        report = run(root)
        self.assertTrue(any(p.endswith("[0].duration") for p in paths(report)))
        msg = [m for lvl, p, m in report.findings if p.endswith("[0].duration")][0]
        self.assertIn("minutes", msg)

    def test_malformed_duration_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["duration"] = "0:75"
        self.assertTrue(any(p.endswith("[0].duration") for p in paths(run(root))))

    def test_long_duration_is_warning(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][1]
        ev["duration"] = "05:00"
        self.assertTrue(any(p.endswith("[1].duration") for p in paths(run(root), "WARN")))

    def test_anchor_long_duration_not_warned(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Fellesareal"][0]
        ev["duration"] = "05:00"
        self.assertFalse(any("Fellesareal" in p for p in paths(run(root), "WARN")))
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run python -m unittest discover -s tools -v`
Expected: the four `DurationTests` FAIL (no finding produced); earlier tests still pass.

- [ ] **Step 3: Implement** (insert into `tools/validate.py` immediately above `def validate(`)

```python
def check_durations(conf, report):
    for path, day, room, event in iter_events(conf):
        dur = event.get("duration")
        if dur in ("", None):
            continue  # structural check already flagged it
        if isinstance(dur, int) or (isinstance(dur, str) and MINUTES_RE.match(dur)):
            report.error(
                f"{path}.duration",
                f'"{dur}" looks like minutes; expected HH:MM (e.g. "00:50")',
            )
            continue
        delta = parse_hhmm(dur)
        if delta is None:
            report.error(f"{path}.duration", f'"{dur}" is not HH:MM')
            continue
        if delta > LONG_SESSION and room != ANCHOR_ROOM:
            report.warn(f"{path}.duration", f'"{dur}" is suspiciously long for a session')


CHECKS.append(check_durations)
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `uv run python -m unittest discover -s tools -v`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator duration checks"
```

---

### Task 5: Date/time agreement checks

**Files:**
- Modify: `tools/validate.py` (append)
- Test: `tools/test_validate.py` (append)

**Interfaces:**
- Consumes: Task 3 helpers
- Produces: `check_times(conf, report)` registered in `CHECKS`. Semantics: ERROR when `date` is unparseable, when `date`'s time-of-day disagrees with `start`, or when the event starts outside `[day_start, day_end)` (nested under the wrong day); WARN when the event *ends* after `day_end`.

- [ ] **Step 1: Write the failing tests** (append)

```python
class TimeTests(unittest.TestCase):
    def _ev(self, root, room="Sal 1", i=0):
        return root["schedule"]["conference"]["days"][0]["rooms"][room][i]

    def test_unparseable_date_is_error(self):
        root = base_schedule()
        self._ev(root)["date"] = "26/08/2026 10:00"
        self.assertTrue(any(p.endswith("[0].date") for p in paths(run(root))))

    def test_start_disagreeing_with_date_is_error(self):
        root = base_schedule()
        self._ev(root)["start"] = "10:30"  # date still says 10:00
        self.assertTrue(any(p.endswith("[0].start") for p in paths(run(root))))

    def test_event_before_day_start_is_error(self):
        root = base_schedule()
        ev = self._ev(root)
        ev["date"] = "2026-08-26T07:00:00+02:00"
        ev["start"] = "07:00"
        self.assertTrue(any(p.endswith("[0].date") for p in paths(run(root))))

    def test_event_ending_after_day_end_is_warning(self):
        root = base_schedule()
        ev = self._ev(root, i=1)
        ev["date"] = "2026-08-26T17:30:00+02:00"
        ev["start"] = "17:30"
        ev["duration"] = "01:00"  # ends 18:30, day_end 18:00
        self.assertTrue(any(p.endswith("[1].duration") for p in paths(run(root), "WARN")))
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run python -m unittest discover -s tools -v`
Expected: the four `TimeTests` FAIL; earlier tests pass.

- [ ] **Step 3: Implement** (insert immediately above `def validate(`)

```python
def check_times(conf, report):
    for path, day, room, event in iter_events(conf):
        dt = parse_iso(event.get("date") or "")
        if dt is None or dt.tzinfo is None:
            report.error(
                f"{path}.date",
                f'"{event.get("date")}" is not an ISO 8601 timestamp with offset',
            )
            continue
        start = parse_hhmm(event.get("start") or "")
        if start is not None:
            date_tod = timedelta(hours=dt.hour, minutes=dt.minute)
            if date_tod != start:
                report.error(
                    f"{path}.start",
                    f'start "{event["start"]}" disagrees with date "{event["date"]}" '
                    f"({dt:%H:%M})",
                )
        day_start = parse_iso(day.get("day_start") or "")
        day_end = parse_iso(day.get("day_end") or "")
        if day_start is None or day_end is None:
            continue  # day-level problem, flagged elsewhere
        if not (day_start <= dt < day_end):
            report.error(
                f"{path}.date",
                f'event starts {dt.isoformat()} but is nested under day '
                f'{day.get("date")} ({day.get("day_start")} – {day.get("day_end")})',
            )
            continue
        dur = parse_hhmm(event.get("duration") or "")
        if dur is not None and dt + dur > day_end:
            report.warn(
                f"{path}.duration",
                f'event ends {(dt + dur).isoformat()}, after day_end {day.get("day_end")}',
            )


CHECKS.append(check_times)
```

- [ ] **Step 4: Run tests, all pass**

Run: `uv run python -m unittest discover -s tools -v`
Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator date/time agreement checks"
```

---

### Task 6: Unique guid/id checks

**Files:**
- Modify: `tools/validate.py` (append)
- Test: `tools/test_validate.py` (append)

**Interfaces:**
- Consumes: Task 3 helpers
- Produces: `check_ids(conf, report)` registered in `CHECKS`

- [ ] **Step 1: Write the failing tests** (append)

```python
class IdTests(unittest.TestCase):
    def test_duplicate_guid_is_error(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        rooms["Sal 1"][1]["guid"] = rooms["Sal 1"][0]["guid"]
        self.assertTrue(any(p.endswith("[1].guid") for p in paths(run(root))))

    def test_duplicate_id_is_error(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        rooms["Fellesareal"][0]["id"] = rooms["Sal 1"][0]["id"]
        report = run(root)
        self.assertTrue(any(".id" in p for p in paths(report)))
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run python -m unittest discover -s tools -v`
Expected: `IdTests` FAIL; earlier tests pass.

- [ ] **Step 3: Implement** (insert immediately above `def validate(`)

```python
def check_ids(conf, report):
    seen = {"guid": {}, "id": {}}
    for path, day, room, event in iter_events(conf):
        for field in ("guid", "id"):
            value = event.get(field)
            if value in ("", None):
                continue
            first = seen[field].get(value)
            if first:
                report.error(
                    f"{path}.{field}",
                    f'duplicate {field} "{value}" (first used at {first})',
                )
            else:
                seen[field][value] = path


CHECKS.append(check_ids)
```

- [ ] **Step 4: Run tests, all pass** — `uv run python -m unittest discover -s tools -v`

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator unique guid/id checks"
```

---

### Task 7: Room consistency checks

**Files:**
- Modify: `tools/validate.py` (append)
- Test: `tools/test_validate.py` (append)

**Interfaces:**
- Consumes: Task 3 helpers
- Produces: `check_rooms(conf, report)` registered in `CHECKS`. Two rules: (a) two room spellings that differ only by case are an error; (b) an event whose `room` differs from its containing rooms-map key is an error.

- [ ] **Step 1: Write the failing tests** (append)

```python
class RoomTests(unittest.TestCase):
    def test_case_variant_room_names_is_error(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        ev = make_event(9, "13:00", "00:50", "sal 1")
        rooms["sal 1"] = [ev]
        report = run(root)
        self.assertTrue(any("case" in m.lower() for lvl, p, m in report.findings if lvl == "ERROR"))

    def test_event_room_mismatching_map_key_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["room"] = "Sal 2"
        self.assertTrue(any(p.endswith("[0].room") for p in paths(run(root))))
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run python -m unittest discover -s tools -v`

- [ ] **Step 3: Implement** (insert immediately above `def validate(`)

```python
def check_rooms(conf, report):
    spellings = {}  # casefolded name -> set of exact spellings
    for di, day in enumerate(conf.get("days") or []):
        rooms = day.get("rooms")
        if not isinstance(rooms, dict):
            continue
        for room_name in rooms:
            spellings.setdefault(room_name.casefold(), set()).add(room_name)
    for folded, variants in spellings.items():
        if len(variants) > 1:
            report.error(
                "schedule.conference.days[].rooms",
                f"room name written with inconsistent case: {sorted(variants)}",
            )
    for path, day, room_name, event in iter_events(conf):
        ev_room = event.get("room")
        if ev_room not in ("", None) and ev_room != room_name:
            report.error(
                f"{path}.room",
                f'event.room "{ev_room}" differs from containing rooms key "{room_name}"',
            )


CHECKS.append(check_rooms)
```

- [ ] **Step 4: Run tests, all pass** — `uv run python -m unittest discover -s tools -v`

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator room consistency checks"
```

---

### Task 8: In-room overlap check

**Files:**
- Modify: `tools/validate.py` (append)
- Test: `tools/test_validate.py` (append)

**Interfaces:**
- Consumes: Task 3 helpers
- Produces: `check_overlap(conf, report)` registered in `CHECKS`. Overlap between two events in the *same room on the same day* is an error; parallel tracks never compare.

- [ ] **Step 1: Write the failing tests** (append)

```python
class OverlapTests(unittest.TestCase):
    def test_overlap_within_room_is_error(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][1]
        ev["date"] = "2026-08-26T10:30:00+02:00"
        ev["start"] = "10:30"  # event 1 runs 10:00-10:50
        self.assertTrue(any("overlap" in m for lvl, p, m in run(root).findings if lvl == "ERROR"))

    def test_parallel_rooms_do_not_overlap(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        rooms["Fellesareal"][0]["date"] = "2026-08-26T10:00:00+02:00"
        rooms["Fellesareal"][0]["start"] = "10:00"  # same time as Sal 1 event
        self.assertEqual(run(root).errors, [])

    def test_back_to_back_is_not_overlap(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][1]
        ev["date"] = "2026-08-26T10:50:00+02:00"
        ev["start"] = "10:50"  # starts exactly when event 1 ends
        self.assertEqual(run(root).errors, [])
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run python -m unittest discover -s tools -v`

- [ ] **Step 3: Implement** (insert immediately above `def validate(`)

```python
def check_overlap(conf, report):
    by_room = {}  # (day index, room) -> [(start_dt, end_dt, path, title)]
    for path, day, room, event in iter_events(conf):
        dt = parse_iso(event.get("date") or "")
        dur = parse_hhmm(event.get("duration") or "")
        if dt is None or dt.tzinfo is None or dur is None:
            continue  # unparseable events are flagged by other checks
        key = (day.get("index"), room)
        by_room.setdefault(key, []).append((dt, dt + dur, path, event.get("title") or "?"))
    for (_, room), evs in by_room.items():
        evs.sort(key=lambda e: (e[0], e[1], e[2]))
        for (s1, e1, p1, t1), (s2, e2, p2, t2) in zip(evs, evs[1:]):
            if s2 < e1:
                report.error(
                    p2,
                    f'overlaps previous event in room "{room}": '
                    f'"{t1}" ends {e1:%H:%M}, "{t2}" starts {s2:%H:%M}',
                )


CHECKS.append(check_overlap)
```

- [ ] **Step 4: Run tests, all pass** — `uv run python -m unittest discover -s tools -v`

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator in-room overlap check"
```

---

### Task 9: Days metadata checks

**Files:**
- Modify: `tools/validate.py` (append)
- Test: `tools/test_validate.py` (append)

**Interfaces:**
- Consumes: Task 3 helpers
- Produces: `check_days(conf, report)` registered in `CHECKS`. Rules: each `days[].date` must lie within `conference.start..end`; the number of days must equal the calendar span; `daysCount` (when present) must equal `len(days)`.

- [ ] **Step 1: Write the failing tests** (append)

```python
class DaysTests(unittest.TestCase):
    def test_day_date_outside_conference_range_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["date"] = "2026-08-27"
        self.assertTrue(any(".date" in p for p in paths(run(root))))

    def test_days_count_mismatch_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["end"] = "2026-08-27"  # 2-day span, 1 day listed
        self.assertTrue(any("days" in p for p in paths(run(root))))

    def test_dayscount_field_mismatch_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["daysCount"] = 3
        self.assertTrue(any("daysCount" in p for p in paths(run(root))))
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run python -m unittest discover -s tools -v`

- [ ] **Step 3: Implement** (insert immediately above `def validate(`)

```python
def check_days(conf, report):
    try:
        conf_start = datetime.fromisoformat(conf["start"]).date()
        conf_end = datetime.fromisoformat(conf["end"]).date()
    except (KeyError, TypeError, ValueError):
        report.error("schedule.conference.start/end", "not parseable as ISO dates")
        return
    days = conf.get("days") or []
    expected = (conf_end - conf_start).days + 1
    if len(days) != expected:
        report.error(
            "schedule.conference.days",
            f"{len(days)} day(s) listed but start..end spans {expected}",
        )
    if "daysCount" in conf and conf["daysCount"] != len(days):
        report.error(
            "schedule.conference.daysCount",
            f'daysCount is {conf["daysCount"]} but {len(days)} day(s) listed',
        )
    for di, day in enumerate(days):
        try:
            d = datetime.fromisoformat(day["date"]).date()
        except (KeyError, TypeError, ValueError):
            report.error(f"schedule.conference.days[{di}].date", "not an ISO date")
            continue
        if not (conf_start <= d <= conf_end):
            report.error(
                f"schedule.conference.days[{di}].date",
                f"{d} outside conference range {conf_start}..{conf_end}",
            )


CHECKS.append(check_days)
```

- [ ] **Step 4: Run tests, all pass** — `uv run python -m unittest discover -s tools -v`

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator days metadata checks"
```

---

### Task 10: Warning checks (titles, speakers)

**Files:**
- Modify: `tools/validate.py` (append)
- Test: `tools/test_validate.py` (append)

**Interfaces:**
- Consumes: Task 3 helpers, `ANCHOR_ROOM`
- Produces: `check_warnings(conf, report)` registered in `CHECKS`. WARN on empty title; WARN on empty `persons` outside `Fellesareal`. (Long durations and day-bounds spill are already warned by Tasks 4 and 5.)

- [ ] **Step 1: Write the failing tests** (append)

```python
class WarningTests(unittest.TestCase):
    def test_empty_title_is_warning(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["title"] = ""
        report = run(root)
        self.assertTrue(any(p.endswith("[0].title") for p in paths(report, "WARN")))
        self.assertEqual(report.errors, [])

    def test_missing_speakers_outside_anchor_room_is_warning(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["persons"] = []
        self.assertTrue(any(p.endswith("[0].persons") for p in paths(run(root), "WARN")))

    def test_anchor_without_speakers_is_fine(self):
        report = run(base_schedule())  # Fellesareal event has no persons
        self.assertFalse(any("Fellesareal" in p for p in paths(report, "WARN")))
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run python -m unittest discover -s tools -v`

- [ ] **Step 3: Implement** (insert immediately above `def validate(`)

```python
def check_warnings(conf, report):
    for path, day, room, event in iter_events(conf):
        if not (event.get("title") or "").strip():
            report.warn(f"{path}.title", "empty title")
        if room != ANCHOR_ROOM and not event.get("persons"):
            report.warn(f"{path}.persons", f'no speakers on a session outside "{ANCHOR_ROOM}"')


CHECKS.append(check_warnings)
```

- [ ] **Step 4: Run tests, all pass** — `uv run python -m unittest discover -s tools -v`

- [ ] **Step 5: Commit**

```bash
git add tools/validate.py tools/test_validate.py
git commit -m "feat: validator warning checks"
```

---

### Task 11: Validate the real schedule; fix data until clean

**Files:**
- Modify: `conferences/fagfestival-2026.json` (data fixes only)

**Interfaces:**
- Consumes: `tools/validate.py` CLI, `conferences/fagfestival-2026.json`

- [ ] **Step 1: Run the validator on the real file**

Run: `uv run python tools/validate.py conferences/fagfestival-2026.json`

- [ ] **Step 2: Fix every ERROR in the schedule data**

Fix the *data*, not the validator — unless a finding is demonstrably a validator bug, in which case: write a failing test in `tools/test_validate.py` reproducing it, fix `validate.py`, keep both. Warnings: fix real mistakes (a spor session missing its speaker); leave legitimate ones (anchors have no speakers, and they're exempt anyway).

- [ ] **Step 3: Re-run until exit code 0**

Run: `uv run python tools/validate.py conferences/fagfestival-2026.json && echo CLEAN`
Expected: `0 error(s), …` and `CLEAN`.

- [ ] **Step 4: Run the full test suite once more**

Run: `uv run python -m unittest discover -s tools -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add conferences/fagfestival-2026.json tools/
git commit -m "fix: Fagfestival schedule passes validator"
```

---

### Task 12: Extraction prompt

**Files:**
- Create: `tools/EXTRACTION_PROMPT.md`

**Interfaces:**
- Consumes: nothing from code; mirrors the conventions of Task 2 and the checks of Tasks 3–10.

- [ ] **Step 1: Write the prompt template**

`tools/EXTRACTION_PROMPT.md` must contain, in this order:

1. A one-paragraph instruction: "Convert the conference program below into a frab-compatible `schedule.json` …".
2. The full JSON skeleton and event template from Task 2 (copy them verbatim, including the guid recipe).
3. A "Rules" list stating, each as one line: `duration` is `HH:MM` end-minus-start — never minutes, never an end time; `date` is full ISO 8601 with the venue's UTC offset and must agree with `start`; every event needs a unique `guid` and integer `id`; room spelling must be identical everywhere; non-session items (registration, lunch, breaks, keynote, closing, dinner) are ordinary events in room `Fellesareal` with `persons: []`; no fields beyond the template; days must cover `conference.start..end` exactly.
4. A closing line: "After generating, the output will be checked by `tools/validate.py`; expect the error report to be pasted back for correction."
5. A placeholder section at the bottom: `## Program\n\n<paste program text here>`.

- [ ] **Step 2: Spot-check the prompt against the validator**

Read `tools/validate.py` check messages; confirm every ERROR class is covered by a rule line in the prompt. Add any missing rule.

- [ ] **Step 3: Commit**

```bash
git add tools/EXTRACTION_PROMPT.md
git commit -m "docs: add LLM extraction prompt for schedules"
```
