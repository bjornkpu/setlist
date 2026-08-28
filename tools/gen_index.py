#!/usr/bin/env python3
"""Generate index.json for a directory of frab schedule.json files.

Provider index format: docs/REQUIREMENTS.md section 4.4. Run manually and
commit the result - no CI, no bot commits.

Usage: uv run python tools/gen_index.py conferences --name "BK's conferences"
"""
import argparse
import json
import sys
from pathlib import Path


def build_index(directory, name):
    schedules = []
    skipped = []
    for path in sorted(Path(directory).glob("*.json")):
        if path.name == "index.json":
            continue
        try:
            root = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            skipped.append(f"{path.name}: {e}")
            continue
        conf = root.get("schedule", {}).get("conference", {}) if isinstance(root, dict) else {}
        if not isinstance(conf, dict) or not conf:
            skipped.append(f"{path.name}: not a frab schedule.json")
            continue
        schedules.append({
            "id": path.stem,
            "title": conf.get("title", path.stem),
            "start": conf.get("start", ""),
            "end": conf.get("end", ""),
            "url": path.name,
        })
    return {"version": "1.0", "name": name, "schedules": schedules}, skipped


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("directory", help="directory of schedule.json files")
    ap.add_argument("--name", default="BK's conferences", help="provider display name")
    args = ap.parse_args(argv)
    index, skipped = build_index(args.directory, args.name)
    for line in skipped:
        print(f"skipped {line}", file=sys.stderr)
    out = Path(args.directory) / "index.json"
    out.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(index['schedules'])} schedule(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
