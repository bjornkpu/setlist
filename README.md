# setlist

A conference companion PWA optimised for one question: **where do I go next?**

Conference programs are built for browsing before the event. setlist is built
for the stairwell with four minutes left: you mark a *pick* per time slot (plus
unordered *maybes* and *avoids*), and the glance view shows the room you need —
room name largest on screen, updating as time passes, fully offline.

- **App:** <https://bjornkpu.github.io/setlist/app/> (keep the trailing slash —
  links without it break offline)
- **Load a schedule directly:** `…/app/?url=<schedule.json url>` (same
  convention as Skedz, so links are interchangeable)
- **Freeze the clock for testing:** add `&at=2026-09-17T12:00:00%2B02:00` —
  the app then resolves "now" against that instant

Requirements live in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), the domain
glossary in [CONTEXT.md](CONTEXT.md), and the approved design in
[docs/superpowers/specs/](docs/superpowers/specs/).

## Layout

```text
app/           the PWA — plain HTML/CSS/JS, no build step, no dependencies
conferences/   frab-compatible schedule.json files + generated index.json
tools/         validator, index generator, Sessionize converter, extraction prompt
tests/         node:test suites for the app's pure logic
```

## Running locally

Any static server from the repo root, then open `/app/`:

```
python -m http.server 8123
```

→ <http://localhost:8123/app/?url=/conferences/fagfestival-2026.json>

The service worker needs HTTP(S); opening `index.html` via `file://` will not
work.

## Tests

```
node --test tests/
python -m unittest discover -s tools -v
```

(On machines that enforce uv, prefix the Python commands with `uv run`.)

Two of these tests are load-bearing guards, not ordinary unit tests:

- `tests/sw.test.js` recomputes a content hash of the app shell and asserts it
  matches `VERSION` in `app/sw.js`. Editing any shell file without bumping
  `VERSION` would strand installed apps on a stale cached shell forever — the
  failing assertion prints the exact string to paste.
- `tools/test_gen_index.py` asserts the committed `conferences/index.json`
  matches what `gen_index.py` would generate. Adding a schedule without
  regenerating the index would make the provider silently serve a stale list.

CI (`.github/workflows/test.yml`) runs both suites on every push to main and
on pull requests.

## Adding a conference

1. **Produce a frab-compatible `schedule.json`:**
   - Source with stable ids (Sessionize, frab/pretalx upstream):
     ```
     uv run python tools/sessionize_to_frab.py <sessionize.json> --title "…" --acronym <acr> --offset +02:00 --tz-name Europe/Oslo --out conferences/<name>.json
     ```
   - Scraped program (PDF, web page): use `tools/EXTRACTION_PROMPT.md` with an
     LLM, then hand-correct.
   - **Guid rules are per-conference and immutable** — see the "Guid identity"
     section of `tools/EXTRACTION_PROMPT.md`. Switching recipes on a
     re-extraction regenerates every guid and silently destroys users' plans.
2. **Validate** (must report 0 errors; read every warning):
   ```
   uv run python tools/validate.py conferences/<name>.json
   ```
3. **Regenerate the index** and run both test suites:
   ```
   uv run python tools/gen_index.py conferences
   ```
4. **Commit the schedule and `conferences/index.json` together**, then push.

## Deploying

GitHub Pages serves the repo root from main: pushing is deploying. The app is
at `/setlist/app/`, and `conferences/` is served as the default provider from
the same origin. If a change touches any file in the app shell, the sw test
forces the `VERSION` bump that makes installed clients pick it up.

## Licence

AGPL-3.0 — see [LICENSE](LICENSE).
