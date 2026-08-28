import test from "node:test";
import assert from "node:assert/strict";
import { overlaps, stateOf, cycle, setState } from "../app/js/plan.js";
import { scheduleKeyFor, defaultDayIndex } from "../app/js/store.js";

const ev = (key, start, end) => ({ key, start, end });
const A = ev("a", 100, 200);
const B = ev("b", 150, 250); // overlaps A
const C = ev("c", 200, 300); // back-to-back with A: no overlap
const all = [A, B, C];

test("overlaps is pairwise intersection, back-to-back excluded", () => {
  assert.equal(overlaps(A, B), true);
  assert.equal(overlaps(B, A), true);
  assert.equal(overlaps(A, C), false);
  assert.equal(overlaps(ev("x", 0, 1000), A), true); // containment
});

test("stateOf defaults to empty string", () => {
  assert.equal(stateOf({}, "a"), "");
  assert.equal(stateOf({ a: "pick" }, "a"), "pick");
});

test("cycle walks none -> pick -> maybe -> avoid -> none", () => {
  assert.equal(cycle(""), "pick");
  assert.equal(cycle("pick"), "maybe");
  assert.equal(cycle("maybe"), "avoid");
  assert.equal(cycle("avoid"), "");
});

test("setState sets and clears without mutating input", () => {
  const before = {};
  const { entries, replacedKeys } = setState(before, A, "maybe", all);
  assert.deepEqual(entries, { a: "maybe" });
  assert.deepEqual(before, {});
  assert.deepEqual(replacedKeys, []);
  assert.deepEqual(setState(entries, A, "", all).entries, {});
});

test("second pick in overlapping range replaces the first", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKeys } = setState(one, B, "pick", all);
  assert.deepEqual(entries, { b: "pick" });
  assert.deepEqual(replacedKeys, ["a"]);
});

test("non-overlapping picks coexist", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKeys } = setState(one, C, "pick", all);
  assert.deepEqual(entries, { a: "pick", c: "pick" });
  assert.deepEqual(replacedKeys, []);
});

test("maybe and avoid are unbounded and never conflict", () => {
  let entries = {};
  for (const e of all) entries = setState(entries, e, "maybe", all).entries;
  assert.deepEqual(entries, { a: "maybe", b: "maybe", c: "maybe" });
  entries = setState(entries, A, "avoid", all).entries;
  assert.equal(entries.a, "avoid");
  assert.equal(entries.b, "maybe");
});

test("re-picking the same event is a no-op replace", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKeys } = setState(one, A, "pick", all);
  assert.deepEqual(entries, { a: "pick" });
  assert.deepEqual(replacedKeys, []);
});

test("a pick spanning two picks reports both", () => {
  const A = ev("a", 0, 100), B = ev("b", 100, 200), C = ev("c", 50, 150);
  const all2 = [A, B, C];
  let entries = setState({}, A, "pick", all2).entries;
  entries = setState(entries, B, "pick", all2).entries;
  const r = setState(entries, C, "pick", all2);
  assert.deepEqual(r.entries, { c: "pick" });
  assert.deepEqual(r.replacedKeys.sort(), ["a", "b"]);
});

test("scheduleKeyFor: URL loads key on the URL, file imports on identity", () => {
  const json = { schedule: { conference: { acronym: "fagfest2026", title: "Fagfestival 2026", start: "2026-08-26" } } };
  assert.equal(scheduleKeyFor(json, "https://x/s.json", false), "https://x/s.json");
  assert.equal(scheduleKeyFor(json, "", true), "file:fagfest2026:2026-08-26");
  const noAcr = { schedule: { conference: { title: "T", start: "2026-01-01" } } };
  assert.equal(scheduleKeyFor(noAcr, "", true), "file:T:2026-01-01");
});

test("defaultDayIndex prefers the day window over the calendar date", () => {
  const model = {
    days: [
      { date: "2026-08-26", dayStart: 1000, dayEnd: 2000 },
      { date: "2026-08-27", dayStart: 2000, dayEnd: 3000 },
    ],
  };
  assert.equal(defaultDayIndex(model, 1500), 0);
  assert.equal(defaultDayIndex(model, 2000), 1); // day 0 window is half-open
  assert.equal(defaultDayIndex(model, 9999), 0); // outside every window, no date match -> 0
});
