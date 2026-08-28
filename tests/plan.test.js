import test from "node:test";
import assert from "node:assert/strict";
import { overlaps, stateOf, cycle, setState } from "../app/js/plan.js";
import { scheduleKeyFor } from "../app/js/store.js";

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
  const { entries, replacedKey } = setState(before, A, "maybe", all);
  assert.deepEqual(entries, { a: "maybe" });
  assert.deepEqual(before, {});
  assert.equal(replacedKey, null);
  assert.deepEqual(setState(entries, A, "", all).entries, {});
});

test("second pick in overlapping range replaces the first", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKey } = setState(one, B, "pick", all);
  assert.deepEqual(entries, { b: "pick" });
  assert.equal(replacedKey, "a");
});

test("non-overlapping picks coexist", () => {
  const one = setState({}, A, "pick", all).entries;
  const { entries, replacedKey } = setState(one, C, "pick", all);
  assert.deepEqual(entries, { a: "pick", c: "pick" });
  assert.equal(replacedKey, null);
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
  const { entries, replacedKey } = setState(one, A, "pick", all);
  assert.deepEqual(entries, { a: "pick" });
  assert.equal(replacedKey, null);
});

test("scheduleKeyFor: URL loads key on the URL, file imports on identity", () => {
  const json = { schedule: { conference: { acronym: "fagfest2026", title: "Fagfestival 2026", start: "2026-08-26" } } };
  assert.equal(scheduleKeyFor(json, "https://x/s.json", false), "https://x/s.json");
  assert.equal(scheduleKeyFor(json, "", true), "file:fagfest2026:2026-08-26");
  const noAcr = { schedule: { conference: { title: "T", start: "2026-01-01" } } };
  assert.equal(scheduleKeyFor(noAcr, "", true), "file:T:2026-01-01");
});
