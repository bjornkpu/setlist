# Conference Schedule Extraction Prompt

Convert the conference program below into a frab-compatible `schedule.json`. Use the JSON skeleton and event template exactly as shown. Every field must be present on every event; use empty string `""` or empty array `[]` when a value is unknown. The output will be checked by `tools/validate.py` for errors — fix any reported issues by re-running this prompt with corrections until validation passes.

## JSON Skeleton

```json
{
  "schedule": {
    "version": "1.0",
    "conference": {
      "title": "<conference title>",
      "acronym": "<acronym>",
      "start": "<YYYY-MM-DD>",
      "end": "<YYYY-MM-DD>",
      "daysCount": <number of days>,
      "timeslot_duration": "<slot granularity, e.g. 00:05>",
      "time_zone_name": "<timezone, e.g. Europe/Oslo>",
      "rooms": ["<room 1>", "<room 2>"],
      "days": [
        {
          "index": 0,
          "date": "<YYYY-MM-DD>",
          "day_start": "<YYYY-MM-DDThh:mm:ss±hh:mm>",
          "day_end": "<YYYY-MM-DDThh:mm:ss±hh:mm>",
          "rooms": {
            "<room 1>": [],
            "<room 2>": []
          }
        }
      ]
    }
  }
}
```

## Event Template

Every event must have all these fields:

```json
{
  "guid": "<uuid5, see recipe below>",
  "id": 1,
  "date": "<YYYY-MM-DDThh:mm:ss±hh:mm>",
  "start": "hh:mm",
  "duration": "hh:mm",
  "room": "<room name, must match rooms key>",
  "slug": "<acronym>-<id>-<slug-fragment>",
  "title": "<event title>",
  "subtitle": "",
  "track": "<track name or empty>",
  "type": "session",
  "language": "<language code, e.g. no or en>",
  "abstract": "",
  "description": "",
  "persons": [{"id": <n>, "public_name": "<name>"}],
  "links": [],
  "attachments": []
}
```

## GUID Recipe

Generate deterministic UUIDs for each event using uuid5:

```bash
uv run python -c "
import uuid
for i in range(1, <max_id>):
    print(i, uuid.uuid5(uuid.NAMESPACE_URL, f'setlist/<acronym>/{i}'))
"
```

Replace `<max_id>` with one more than the highest event id, and `<acronym>` with the conference acronym.

## Rules

- `duration` must be `HH:MM` (end time minus start time), never in minutes, never an end time; e.g. a session from 11:10–12:00 is `"00:50"`.
- `date` must be full ISO 8601 with the venue's UTC offset (e.g. `2026-08-26T09:00:00+02:00`); the time portion must match the `start` field.
- Every event must have a unique `guid` and a unique integer `id`.
- `room` spelling must be identical everywhere it appears (case-sensitive); must match the key in the containing `rooms` dict.
- `daysCount` must equal the number of entries in `days`, which must cover `conference.start` through `conference.end` exactly (one day per calendar date in the range).
- `persons` format: `[{"id": <n>, "public_name": "<name>"}]` — assign integer person ids sequentially (1, 2, 3, …), reusing the same id when the same speaker appears in multiple sessions.
- Each event's `date` must fall within its containing day's `day_start` and `day_end` timestamps.
- Non-session items (registration, lunch, breaks, keynote, closing, dinner) are ordinary events in room `Fellesareal` with `persons: []`.
- No fields beyond the template are allowed; remove any extra fields.
- No overlapping events in the same room.
- Each session outside `Fellesareal` should list speakers in `persons`; sessions with no speakers will trigger a warning.

After generating, the output will be checked by `tools/validate.py`; expect the error report to be pasted back for correction.

## Program

<paste program text here>
