# Phase 6: Providers + Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Providers (index.json discovery, upcoming/past split, shipped default), a library view (cached schedules: open/reload/remove; providers: add/browse/remove; load by URL), and the `gen_index.py` tool + committed `conferences/index.json` — build order step 6 of `docs/REQUIREMENTS.md` §8, spec §4.4/§5.4.

**Architecture:** A providers module with pure, node-tested helpers (`resolveProviderUrl`, `parseIndex`, `splitByDate`) plus `fetchIndex` (`cache: "no-store"` — GitHub Pages sends max-age=600, phase-5 ruling). Store grows the seams phase 4's review prescribed: `pickSchedule(records, nowMs, activeKey)` (pure selection policy) + `activateRecord(record)`, plus `removeSchedule` and provider CRUD (default provider synthesized unless a settings flag removes it). Schedule fetching moves out of main.js into `actions.js` (`loadScheduleFromUrl -> {ok, error}`) so the library and the boot path share one code path. New `views/library.js` behind `#/library`, reachable without an active schedule.

**Tech Stack:** Plain JS ES modules; Python stdlib for the tool. No build, no dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-setlist-design.md` (Offline & providers; decisions 3, 9; `docs/REQUIREMENTS.md` §4.4, §5.4, §6.2)

## Global Constraints

- Provider resolution: append `/index.json` when the URL does not already end in `.json` (REQUIREMENTS §4.4). Relative schedule `url`s resolve against the index URL via `new URL(rel, base)`. Unknown index fields ignored, never rejected; entries without a usable `url` dropped, other missing fields defaulted.
- Upcoming/past split on `end` vs today (today counts as upcoming); upcoming sorted by start ascending, past descending.
- Default provider `https://bjornkpu.github.io/setlist/conferences/` ships built-in and is removable (settings flag; spec decision + REQUIREMENTS §4.4). Removing a provider keeps its cached schedules (spec decision 9).
- Removing a schedule deletes its `schedules` AND `plans` records, only after confirmation (spec §5.4). Reloading a schedule refetches with `cache: "no-store"` and must keep the plan (guid-keyed record untouched).
- All provider/schedule fetches use `cache: "no-store"` (phase-5 ruling: Pages' max-age=600 would make "reload" look broken).
- `#/library` renders WITHOUT an active schedule (first-run: add provider before any schedule exists). All schedule-sourced/user text escaped via `esc`; toast stays textContent-only.
- New shell files (`js/providers.js`, `js/views/library.js`) go into sw.js `SHELL`, and `VERSION` must be re-hashed — `tests/sw.test.js` fails with the exact value to paste.
- Test commands: `node --test tests/` and `uv run python -m unittest discover -s tools -v`. Commits: Conventional Commits, subject ≤ 50 chars.

---

### Task 1: `gen_index.py` + committed `conferences/index.json` (TDD)

**Files:**
- Create: `tools/gen_index.py`
- Test: `tools/test_gen_index.py`
- Create (generated): `conferences/index.json`

**Interfaces:**
- Produces: `build_index(directory, name) -> (index_dict, skipped_list)`; CLI `uv run python tools/gen_index.py <dir> [--name NAME]` writes `<dir>/index.json`. Entry shape per §4.4: `{id: <file stem>, title, start, end, url: <file name, relative>}`.

- [ ] **Step 1: Write the failing tests**

Create `tools/test_gen_index.py`:

```python
import json
import tempfile
import unittest
from pathlib import Path

from gen_index import build_index


def schedule(title, start, end):
    return {"schedule": {"conference": {"title": title, "start": start, "end": end, "days": []}}}


class GenIndexTests(unittest.TestCase):
    def test_builds_entries_and_skips_junk(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "a-conf.json").write_text(json.dumps(schedule("A", "2026-01-01", "2026-01-02")), encoding="utf-8")
            (d / "b-conf.json").write_text(json.dumps(schedule("B", "2026-02-01", "2026-02-01")), encoding="utf-8")
            (d / "index.json").write_text("{}", encoding="utf-8")
            (d / "junk.json").write_text("not json", encoding="utf-8")
            (d / "notes.txt").write_text("ignore", encoding="utf-8")
            index, skipped = build_index(d, "Test")
            self.assertEqual(index["version"], "1.0")
            self.assertEqual(index["name"], "Test")
            self.assertEqual([s["id"] for s in index["schedules"]], ["a-conf", "b-conf"])
            self.assertEqual(index["schedules"][0]["url"], "a-conf.json")
            self.assertEqual(index["schedules"][0]["title"], "A")
            self.assertEqual(index["schedules"][0]["start"], "2026-01-01")
            self.assertEqual(index["schedules"][0]["end"], "2026-01-02")
            self.assertEqual(len(skipped), 1)
            self.assertIn("junk.json", skipped[0])

    def test_real_conferences_dir(self):
        conf_dir = Path(__file__).resolve().parent.parent / "conferences"
        index, skipped = build_index(conf_dir, "x")
        self.assertEqual(skipped, [])
        self.assertIn("fagfestival-2026", [s["id"] for s in index["schedules"]])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run python -m unittest discover -s tools -v`
Expected: gen_index tests FAIL (`ModuleNotFoundError: gen_index`); validator tests still pass.

- [ ] **Step 3: Create `tools/gen_index.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `uv run python -m unittest discover -s tools -v`
Expected: all PASS

- [ ] **Step 5: Generate the real index and eyeball it**

```bash
uv run python tools/gen_index.py conferences
uv run python -c "import json; print(json.dumps(json.load(open('conferences/index.json', encoding='utf-8')), indent=2))"
```

Expected: one entry, id `fagfestival-2026`, url `fagfestival-2026.json`, dates 2026-08-26.

- [ ] **Step 6: Commit**

```bash
git add tools/gen_index.py tools/test_gen_index.py conferences/index.json
git commit -m "feat: provider index generator and index.json"
```

---

### Task 2: providers module + store/actions seams (TDD)

**Files:**
- Create: `app/js/providers.js`
- Modify: `app/js/store.js` (pickSchedule/activateRecord refactor; removeSchedule; provider CRUD)
- Modify: `app/js/actions.js` (add `loadScheduleFromUrl`)
- Modify: `app/js/main.js` (loadSchedule delegates to the action)
- Test: `tests/providers.test.js`, `tests/plan.test.js` (append)

**Interfaces:**
- `providers.js`:
  - `resolveProviderUrl(input) -> url` (trim; append `/index.json` unless already `.json`)
  - `parseIndex(json, baseUrl) -> {name, schedules: [{id, title, start, end, url<absolute>}]}` (defensive)
  - `splitByDate(schedules, todayStr) -> {upcoming, past}` (today counts as upcoming; upcoming asc, past desc by start)
  - `fetchIndex(providerUrl) -> Promise<{url, name, schedules}>` (no-store; throws on HTTP error)
- `store.js`:
  - `pickSchedule(records, nowMs, activeKey) -> record|null` — covers-today, else activeKey match, else most recent `loadedAt`; exported pure
  - `activateRecord(record) -> Promise` — activate a cached record (file-key aware)
  - `removeSchedule(key) -> Promise` — deletes schedules+plans records; if it was active, clears state and tries `restoreLast()`
  - `DEFAULT_PROVIDER` (string), `listProviders() -> Promise<[{key, url, name?, builtin?}]>`, `addProvider(url)`, `removeProvider(provider)` — built-in default synthesized unless setting `defaultProviderRemoved` is `"yes"`; removing the built-in sets that flag
- `actions.js`: `loadScheduleFromUrl(url) -> Promise<{ok: true} | {ok: false, error}>` — fetch (no-store) + activate; NO rendering (callers decide UI)

- [ ] **Step 1: Write the failing tests**

Create `tests/providers.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProviderUrl, parseIndex, splitByDate } from "../app/js/providers.js";

test("resolveProviderUrl appends index.json unless already .json", () => {
  assert.equal(resolveProviderUrl("https://x.y/conf"), "https://x.y/conf/index.json");
  assert.equal(resolveProviderUrl("https://x.y/conf/"), "https://x.y/conf/index.json");
  assert.equal(resolveProviderUrl("https://x.y/my-index.json"), "https://x.y/my-index.json");
  assert.equal(resolveProviderUrl("  https://x.y/conf  "), "https://x.y/conf/index.json");
});

test("parseIndex resolves relative urls and defends against junk", () => {
  const base = "https://host/prov/index.json";
  const { name, schedules } = parseIndex(
    {
      version: "1.0",
      name: "BK",
      surprise: true,
      schedules: [
        { id: "a", title: "A", start: "2026-01-01", end: "2026-01-02", url: "a.json", extra: 1 },
        { id: "b", url: "https://other.example/b.json" },
        { id: "no-url" },
        "junk",
        null,
      ],
    },
    base,
  );
  assert.equal(name, "BK");
  assert.equal(schedules.length, 2);
  assert.equal(schedules[0].url, "https://host/prov/a.json");
  assert.equal(schedules[1].url, "https://other.example/b.json");
  assert.equal(schedules[1].title, "b"); // falls back to id
  assert.equal(schedules[1].start, "");
});

test("parseIndex tolerates a missing schedules array", () => {
  assert.deepEqual(parseIndex({ name: 1 }, "https://h/i.json"), { name: "", schedules: [] });
});

test("splitByDate: today counts as upcoming; sort directions", () => {
  const s = (id, start, end) => ({ id, title: id, start, end, url: id });
  const today = "2026-08-28";
  const { upcoming, past } = splitByDate(
    [s("old", "2026-08-01", "2026-08-27"), s("now", "2026-08-28", "2026-08-28"),
     s("later", "2026-09-10", "2026-09-11"), s("soon", "2026-09-01", "2026-09-02"),
     s("undated", "", "")],
    today,
  );
  assert.deepEqual(upcoming.map((x) => x.id), ["undated", "now", "soon", "later"]);
  assert.deepEqual(past.map((x) => x.id), ["old"]);
});
```

Append to `tests/plan.test.js` (extend the existing store.js import line with `pickSchedule`):

```js
test("pickSchedule precedence: covers today, then active key, then most recent", () => {
  const nowMs = Date.parse("2026-08-26T12:00:00+02:00");
  const a = { key: "a", start: "2026-08-25", end: "2026-08-25", loadedAt: 1 };
  const b = { key: "b", start: "2026-08-26", end: "2026-08-27", loadedAt: 2 };
  const c = { key: "c", start: "2026-09-01", end: "2026-09-02", loadedAt: 3 };
  assert.equal(pickSchedule([a, b, c], nowMs, "").key, "b");
  assert.equal(pickSchedule([a, c], nowMs, "a").key, "a");
  assert.equal(pickSchedule([a, c], nowMs, "missing").key, "c");
  assert.equal(pickSchedule([], nowMs, ""), null);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test tests/`
Expected: providers tests + pickSchedule test FAIL; existing 41 pass.

- [ ] **Step 3: Create `app/js/providers.js`**

```js
// Provider index handling (REQUIREMENTS 4.4). Pure helpers + one fetch.

export function resolveProviderUrl(input) {
  const url = input.trim();
  if (url.endsWith(".json")) return url;
  return url.endsWith("/") ? `${url}index.json` : `${url}/index.json`;
}

export function parseIndex(json, baseUrl) {
  const name = typeof json?.name === "string" ? json.name : "";
  const raw = Array.isArray(json?.schedules) ? json.schedules : [];
  const schedules = [];
  for (const s of raw) {
    if (!s || typeof s !== "object" || typeof s.url !== "string" || !s.url) continue;
    let url;
    try {
      url = new URL(s.url, baseUrl).href;
    } catch {
      continue;
    }
    schedules.push({
      id: String(s.id ?? s.url),
      title: String(s.title ?? s.id ?? s.url),
      start: typeof s.start === "string" ? s.start : "",
      end: typeof s.end === "string" ? s.end : "",
      url,
    });
  }
  return { name, schedules };
}

// `end` >= today (or missing dates) counts as upcoming. ISO dates compare
// lexicographically.
export function splitByDate(schedules, todayStr) {
  const upcoming = schedules
    .filter((s) => !s.end || s.end >= todayStr)
    .sort((a, b) => a.start.localeCompare(b.start));
  const past = schedules
    .filter((s) => s.end && s.end < todayStr)
    .sort((a, b) => b.start.localeCompare(a.start));
  return { upcoming, past };
}

export async function fetchIndex(providerUrl) {
  const url = resolveProviderUrl(providerUrl);
  const res = await fetch(url, { cache: "no-store" }); // Pages sends max-age=600
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { url, ...parseIndex(await res.json(), url) };
}
```

- [ ] **Step 4: Extend `app/js/store.js`**

Add `dbDelete` to the db.js import. Add at the top, near `state`:

```js
export const DEFAULT_PROVIDER = "https://bjornkpu.github.io/setlist/conferences/";
```

Replace `restoreLast` with the split version, and add the new functions (all inserted where `restoreLast` lives today):

```js
// Selection policy (spec decision 3): the schedule covering today wins, else
// the remembered active one, else the most recently loaded. Pure.
export function pickSchedule(records, nowMs, activeKey) {
  if (!records?.length) return null;
  const today = new Date(nowMs).toLocaleDateString("sv-SE");
  return (
    records.find((s) => s.start && s.end && s.start <= today && today <= s.end) ??
    records.find((s) => s.key === activeKey) ??
    records.reduce((a, b) => ((a.loadedAt ?? 0) >= (b.loadedAt ?? 0) ? a : b))
  );
}

export async function activateRecord(record) {
  await activate(record.json, {
    url: record.url,
    fromFile: record.key.startsWith("file:"),
    label: record.key,
  });
}

export async function restoreLast() {
  let all;
  try {
    all = await dbGetAll("schedules");
  } catch {
    return false;
  }
  const record = pickSchedule(all, now(), getSetting("activeSchedule"));
  if (!record) return false;
  try {
    await activateRecord(record);
    return true;
  } catch {
    return false; // cached record no longer parses; leave load screen
  }
}

// Deletes the schedule and its plan (spec 5.4 — caller confirms first).
export async function removeSchedule(key) {
  try {
    await dbDelete("schedules", key);
    await dbDelete("plans", key);
  } catch {
    // storage unavailable; nothing to remove
  }
  if (state.scheduleKey === key) {
    state.model = null;
    state.scheduleKey = "";
    state.sourceUrl = "";
    state.plan = {};
    await restoreLast(); // another cached schedule takes over if one exists
  }
}

export async function listProviders() {
  let stored = [];
  try {
    stored = await dbGetAll("providers");
  } catch {
    // storage unavailable
  }
  const list = [];
  if (getSetting("defaultProviderRemoved") !== "yes") {
    list.push({ key: DEFAULT_PROVIDER, url: DEFAULT_PROVIDER, name: "setlist default", builtin: true });
  }
  return [...list, ...stored.filter((p) => p.key !== DEFAULT_PROVIDER)];
}

export async function addProvider(url) {
  if (url === DEFAULT_PROVIDER) {
    setSetting("defaultProviderRemoved", ""); // re-adding the built-in restores it
    return;
  }
  try {
    await dbPut("providers", { key: url, url });
  } catch {
    // storage unavailable
  }
}

export async function removeProvider(provider) {
  if (provider.builtin) {
    setSetting("defaultProviderRemoved", "yes");
    return;
  }
  try {
    await dbDelete("providers", provider.key);
  } catch {
    // storage unavailable
  }
}
```

- [ ] **Step 5: Add `loadScheduleFromUrl` to `app/js/actions.js`**

Extend the store import with `activate` and append:

```js
// Fetch + activate a schedule. No rendering — callers decide what to show.
export async function loadScheduleFromUrl(url) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" }); // reloads must see upstream changes
  } catch {
    return {
      ok: false,
      error: `Could not fetch ${url}. The host may block browser requests (CORS), or you are offline. You can import the file instead.`,
    };
  }
  if (!res.ok) return { ok: false, error: `Could not load ${url}: HTTP ${res.status}.` };
  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `${url} is not valid JSON.` };
  }
  try {
    await activate(json, { url });
  } catch (e) {
    return { ok: false, error: `${url}: ${e.message}` };
  }
  return { ok: true };
}
```

- [ ] **Step 6: Slim `app/js/main.js`'s `loadSchedule` to use it**

Add `loadScheduleFromUrl` to the actions import (create the import if absent: `import { loadScheduleFromUrl } from "./actions.js";`). Replace the whole `loadSchedule` function body:

```js
async function loadSchedule(url) {
  app.innerHTML = `<p class="status pad">Loading…</p>`;
  const result = await loadScheduleFromUrl(url);
  if (!result.ok) {
    await failLoad(result.error);
    return;
  }
  location.hash = "#/";
  route();
  // strip only ?url= after a successful load; other params (e.g. ?at=) stay
  const params = new URLSearchParams(location.search);
  if (params.has("url")) {
    params.delete("url");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
}
```

(The activate/fetch logic it previously contained now lives in the action; `failLoad` and `renderLoadScreen` stay.)

- [ ] **Step 7: Run all tests, syntax checks**

Run: `node --test tests/` — expected: all PASS (46). NOTE: `tests/sw.test.js` will FAIL if run after Task 3 adds files without SHELL updates — at this point it must still pass (no new app files were added by this task... `providers.js` IS new). So: this task DOES add `app/js/providers.js`, which makes `tests/sw.test.js` fail until SHELL is updated. Handle it NOW rather than leaving the suite red between commits: add `"./js/providers.js"` to `SHELL` in `app/sw.js` (alphabetical position, after `"./js/plan.js"`), rerun `node --test tests/`, read the new hash from the VERSION assertion failure, and set `VERSION` accordingly. Then all tests pass.

```bash
node --check app/js/providers.js && node --check app/js/store.js && node --check app/js/actions.js && node --check app/js/main.js && node --check app/sw.js && echo SYNTAX-OK
```

- [ ] **Step 8: Commit**

```bash
git add app/js/ app/sw.js tests/
git commit -m "feat: provider module and schedule actions"
```

---

### Task 3: Library view

**Files:**
- Create: `app/js/views/library.js`
- Modify: `app/js/main.js` (route + import)
- Modify: `app/js/views/browse.js` (header link)
- Modify: `app/js/views/event.js` (history-aware back link)
- Modify: `app/css/app.css` (append)
- Modify: `app/sw.js` (SHELL + VERSION re-hash)

**Interfaces:**
- Consumes: everything Task 2 produced, plus `dbGetAll`, `showToast`, `now`, `esc`.
- Produces: `renderLibrary(app, state)` (async) behind `#/library`, reachable with or without an active schedule.

- [ ] **Step 1: Create `app/js/views/library.js`**

```js
import { esc } from "../html.js";
import {
  state,
  activateRecord,
  removeSchedule,
  listProviders,
  addProvider,
  removeProvider,
} from "../store.js";
import { dbGetAll } from "../db.js";
import { fetchIndex, splitByDate } from "../providers.js";
import { loadScheduleFromUrl } from "../actions.js";
import { showToast } from "../toast.js";
import { now } from "../clock.js";

export async function renderLibrary(app, state) {
  app.innerHTML = `<p class="status pad">Loading library…</p>`;
  let schedules = [];
  try {
    schedules = await dbGetAll("schedules");
  } catch {
    // storage unavailable: library still shows providers and load-by-URL
  }
  schedules.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const providers = await listProviders();
  app.innerHTML = `
    <div class="library">
      <header class="bar"><a href="#/">‹ Now</a><h1>Library</h1></header>
      <h2>Schedules</h2>
      <ul class="cards">
        ${schedules.map(scheduleRow).join("") || `<li class="status">No schedules loaded yet.</li>`}
      </ul>
      <h2>Providers</h2>
      <ul class="cards">
        ${providers.map(providerRow).join("") || `<li class="status">No providers.</li>`}
      </ul>
      <form id="add-provider" class="row-form">
        <input type="url" name="url" placeholder="Provider URL" required aria-label="Provider URL">
        <button type="submit">Add provider</button>
      </form>
      <form id="load-url" class="row-form">
        <input type="url" name="url" placeholder="https://…/schedule.json" required aria-label="Schedule URL">
        <button type="submit">Load schedule</button>
      </form>
    </div>`;
  wire(app, state);
}

function scheduleRow(r) {
  const active = r.key === state.scheduleKey;
  const dates = `${esc(r.start)}${r.end && r.end !== r.start ? `–${esc(r.end)}` : ""}`;
  return `<li class="${active ? "active" : ""}" data-key="${esc(r.key)}">
    <div class="card-main">
      <span class="title">${esc(r.title || r.key)}</span>
      <span class="meta">${dates}${active ? " · active" : ""}</span>
    </div>
    <div class="card-actions">
      <button data-action="open">Open</button>
      ${r.url ? `<button data-action="reload">Reload</button>` : ""}
      <button data-action="remove">Remove</button>
    </div>
  </li>`;
}

function providerRow(p) {
  return `<li data-provider="${esc(p.key)}">
    <div class="card-main">
      <span class="title">${esc(p.name || p.url)}</span>
      <span class="meta">${esc(p.url)}</span>
    </div>
    <div class="card-actions">
      <button data-action="browse">Browse</button>
      <button data-action="remove-provider">Remove</button>
    </div>
    <div class="provider-schedules"></div>
  </li>`;
}

function wire(app, state) {
  const rerender = () => renderLibrary(app, state).catch(console.error);
  app.querySelector(".library").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    try {
      await handleAction(btn, state, rerender);
    } catch (err) {
      showToast(String(err?.message ?? err));
    }
  });
  app.querySelector("#add-provider").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addProvider(new FormData(e.target).get("url").trim());
    rerender();
  });
  app.querySelector("#load-url").addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = await loadScheduleFromUrl(new FormData(e.target).get("url").trim());
    if (result.ok) location.hash = "#/";
    else showToast(result.error);
  });
}

async function handleAction(btn, state, rerender) {
  const action = btn.dataset.action;
  if (action === "load-schedule") {
    btn.disabled = true;
    const result = await loadScheduleFromUrl(btn.dataset.url);
    if (result.ok) location.hash = "#/";
    else {
      btn.disabled = false;
      showToast(result.error);
    }
    return;
  }
  if (action === "browse") {
    await browseProvider(btn.closest("li[data-provider]"));
    return;
  }
  if (action === "remove-provider") {
    const li = btn.closest("li[data-provider]");
    const provider = (await listProviders()).find((p) => p.key === li.dataset.provider);
    if (provider && confirm(`Remove provider "${provider.name || provider.url}"? Cached schedules stay.`)) {
      await removeProvider(provider);
      rerender();
    }
    return;
  }
  const key = btn.closest("li[data-key]")?.dataset.key;
  const record = (await dbGetAll("schedules")).find((r) => r.key === key);
  if (!record) return;
  if (action === "open") {
    await activateRecord(record);
    location.hash = "#/";
  } else if (action === "reload") {
    btn.disabled = true;
    const result = await loadScheduleFromUrl(record.url);
    showToast(result.ok ? "Schedule reloaded — plan kept." : result.error);
    rerender();
  } else if (action === "remove") {
    if (confirm(`Remove "${record.title || key}" and its plan? This cannot be undone.`)) {
      await removeSchedule(key);
      rerender();
    }
  }
}

async function browseProvider(li) {
  const box = li.querySelector(".provider-schedules");
  box.innerHTML = `<p class="status">Loading…</p>`;
  let index;
  try {
    index = await fetchIndex(li.dataset.provider);
  } catch (err) {
    box.innerHTML = `<p class="error">Could not load provider index: ${esc(err.message)}. The host may block browser requests (CORS) or you are offline.</p>`;
    return;
  }
  const today = new Date(now()).toLocaleDateString("sv-SE");
  const { upcoming, past } = splitByDate(index.schedules, today);
  const item = (s) => `<li>
      <span class="title">${esc(s.title)}</span>
      <span class="meta">${esc(s.start)}${s.end && s.end !== s.start ? `–${esc(s.end)}` : ""}</span>
      <button data-action="load-schedule" data-url="${esc(s.url)}">Load</button>
    </li>`;
  box.innerHTML = `
    ${upcoming.length
      ? `<h3>Upcoming</h3><ul class="provider-list">${upcoming.map(item).join("")}</ul>`
      : `<p class="status">No upcoming events.</p>`}
    ${past.length
      ? `<details><summary>Past (${past.length})</summary><ul class="provider-list">${past.map(item).join("")}</ul></details>`
      : ""}`;
}
```

(The `load-schedule` buttons rendered inside `browseProvider` are handled by the delegated `.library` click listener.)

- [ ] **Step 2: Route it in `app/js/main.js`**

Add `import { renderLibrary } from "./views/library.js";`. In `route()`, FIRST — before the `!state.model` guard — so the library works with no schedule loaded:

```js
function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/library")) {
    renderLibrary(app, state).catch(console.error);
    return;
  }
  if (!state.model) {
    renderLoadScreen();
    return;
  }
  // …rest unchanged…
```

And in `renderLoadScreen`'s HTML, after the file-import paragraph, add:

```js
      <p><a href="#/library">Library &amp; providers</a></p>
```

- [ ] **Step 3: Browse header link (`app/js/views/browse.js`)**

Replace the header line so it carries both links:

```js
    <header class="bar"><h1>${esc(model.title)}</h1><span class="bar-links"><a href="#/library">Library</a> <a class="now-link" href="#/">Now</a></span></header>
```

- [ ] **Step 4: History-aware back link (`app/js/views/event.js`)**

Both back links (`not found` branch and the detail header) change from `<a href="#/browse">‹ Program</a>` to `<a href="#/browse" data-back>‹ Back</a>`. At the end of `renderEvent` (both exits render one), add once after the innerHTML assignment in each branch — or simplest, at the end of the function for the found branch and inline for the not-found branch:

```js
  app.querySelector("[data-back]")?.addEventListener("click", (e) => {
    if (history.length > 1) {
      e.preventDefault();
      history.back(); // return to slot/browse/wherever we came from
    }
  });
```

(For the not-found branch, add the same three-line listener right after its `app.innerHTML = …`.)

- [ ] **Step 5: Append to `app/css/app.css`**

```css
/* library */
.library h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 1rem 1rem 0.25rem;
}
.cards { list-style: none; margin: 0; padding: 0; }
.cards > li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--line);
}
.cards > li.active { border-left: 3px solid var(--accent); }
.card-main { flex: 1; min-width: 12rem; display: flex; flex-direction: column; }
.card-main .meta { color: var(--muted); font-size: 0.9rem; overflow-wrap: anywhere; }
.card-actions { display: flex; gap: 0.5rem; }
.card-actions button, .row-form button, .provider-list button {
  font: inherit;
  padding: 0.4rem 0.75rem;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: none;
}
.row-form { display: flex; gap: 0.5rem; padding: 0.5rem 1rem; }
.row-form input {
  flex: 1;
  font: inherit;
  padding: 0.4rem;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.provider-schedules { flex-basis: 100%; }
.provider-list { list-style: none; margin: 0; padding: 0; }
.provider-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
}
.provider-list .title { flex: 1; }
.provider-list .meta { color: var(--muted); }
.provider-schedules h3, .provider-schedules summary {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0.5rem 0 0.25rem;
}
.bar-links a { color: var(--accent); text-decoration: none; margin-left: 0.75rem; }
```

- [ ] **Step 6: SHELL + VERSION**

Add `"./js/views/library.js"` to `SHELL` in `app/sw.js` (after `"./js/views/glance.js"`). Run `node --test tests/`, read the new hash from the VERSION assertion failure message, set `VERSION`, rerun until green.

- [ ] **Step 7: Verify**

```bash
node --test tests/
node --check app/js/views/library.js && node --check app/js/main.js && node --check app/js/views/browse.js && node --check app/js/views/event.js && node --check app/sw.js && echo SYNTAX-OK
```

Expected: 46 tests PASS, `SYNTAX-OK`. HTTP smoke: serve repo root, curl `app/js/views/library.js` and `conferences/index.json` → 200, kill server.

- [ ] **Step 8: Commit**

```bash
git add app/
git commit -m "feat: library view with providers"
```

---

## Manual QA (after all tasks — human, real browser)

Serve repo root, open `http://localhost:8123/app/`:

1. Load screen shows the Library link; open it with nothing cached — "No schedules loaded yet", default provider listed.
2. Add provider `http://localhost:8123/conferences` — Browse shows Fagfestival under Past (it ended 2026-08-26); Load activates it and lands on glance.
3. Library: schedule listed with dates + active; Reload keeps picks ("plan kept" toast); Remove asks for confirmation, removes schedule AND plan; the library rerenders empty, and ‹ Now then shows the load screen (nothing else cached).
4. Remove the default provider — gone after rerender; re-add its URL — back (flag reset path).
5. Browse a bogus provider URL — specific error inside the provider card, library still usable.
6. From browse → session detail → ‹ Back returns to browse; from glance → slot → session → ‹ Back returns to the slot.
7. Offline: library renders (cached schedules listed); provider Browse fails with the CORS/offline message; Open still works.
