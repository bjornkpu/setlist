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
