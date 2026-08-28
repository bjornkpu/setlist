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
