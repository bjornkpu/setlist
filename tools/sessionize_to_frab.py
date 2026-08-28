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
