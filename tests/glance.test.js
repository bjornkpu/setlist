import test from "node:test";
import assert from "node:assert/strict";
import { resolveGlance, slotEvents, slotFor, fmtUntil } from "../app/js/glance.js";

const MIN = 60000;
const ev = (key, start, end, room = "R" + key) => ({
  key, start: start * MIN, end: end * MIN, room,
  startLabel: "", endLabel: "", title: "T" + key, persons: [],
});

// Timeline (minutes): reg 0-60 solo; a1/b1 parallel 60-110;
// lunch 120-170 solo; a2/b2 parallel 170-220. Gap 110-120.
const reg = ev("reg", 0, 60, "Fellesareal");
const a1 = ev("a1", 60, 110);
const b1 = ev("b1", 60, 110);
const lunch = ev("lunch", 120, 170, "Fellesareal");
const a2 = ev("a2", 170, 220);
const b2 = ev("b2", 170, 220);
const EVENTS = [reg, a1, b1, lunch, a2, b2];
const at = (min) => min * MIN;

test("phase boundaries", () => {
  assert.equal(resolveGlance(EVENTS, {}, at(-10)).phase, "before");
  assert.equal(resolveGlance(EVENTS, {}, at(100)).phase, "during");
  assert.equal(resolveGlance(EVENTS, {}, at(220)).phase, "after");
  assert.equal(resolveGlance([], {}, 0).phase, "empty");
});

test("solo event is Now without a pick", () => {
  const g = resolveGlance(EVENTS, {}, at(30));
  assert.equal(g.current.dest.key, "reg");
});

test("pick beats parallel sessions as Now", () => {
  const g = resolveGlance(EVENTS, { b1: "pick" }, at(90));
  assert.equal(g.current.dest.key, "b1");
});

test("parallel unpicked slot has no destination but a ref", () => {
  const g = resolveGlance(EVENTS, {}, at(90));
  assert.equal(g.current.dest, null);
  assert.ok(["a1", "b1"].includes(g.current.ref.key));
});

test("avoided solo is suppressed", () => {
  const g = resolveGlance(EVENTS, { lunch: "avoid" }, at(140));
  assert.equal(g.current.dest, null);
});

test("Next resolves the earliest upcoming slot", () => {
  const g = resolveGlance(EVENTS, { a2: "pick" }, at(140)); // during lunch
  assert.equal(g.next.dest.key, "a2");
  const g2 = resolveGlance(EVENTS, {}, at(140));
  assert.equal(g2.next.dest, null); // a2/b2 parallel, nothing picked
  assert.ok(["a2", "b2"].includes(g2.next.ref.key));
});

test("Next skips avoided events as reference", () => {
  const g = resolveGlance(EVENTS, { a2: "avoid", b2: "avoid" }, at(140));
  assert.equal(g.next, null); // nothing non-avoided upcoming
});

test("Next during the gap is the upcoming solo", () => {
  const g = resolveGlance(EVENTS, {}, at(115));
  assert.equal(g.current, null); // nothing running
  assert.equal(g.next.dest.key, "lunch");
});

test("before phase points at the first slot", () => {
  const g = resolveGlance(EVENTS, {}, at(-30));
  assert.equal(g.next.dest.key, "reg"); // solo first item
  assert.equal(g.firstStart, 0);
});

test("zero-duration event is never Now", () => {
  const z = ev("z", 90, 90);
  const g = resolveGlance([...EVENTS, z], { z: "pick" }, at(90));
  assert.notEqual(g.current?.dest?.key, "z");
});

test("slotEvents includes ref and overlapping only", () => {
  assert.deepEqual(slotEvents(EVENTS, a1).map((e) => e.key).sort(), ["a1", "b1"]);
  assert.deepEqual(slotEvents(EVENTS, reg).map((e) => e.key), ["reg"]);
});

test("zero-duration marker does not break a solo anchor", () => {
  const marker = ev("m", 140, 140);
  const g = resolveGlance([...EVENTS, marker], {}, at(140));
  assert.equal(g.current.dest.key, "lunch");
});

test("slotFor buckets by plan state", () => {
  const b = slotFor(EVENTS, { a1: "pick", b1: "avoid" }, a1);
  assert.deepEqual(b.picks.map((e) => e.key), ["a1"]);
  assert.deepEqual(b.avoided.map((e) => e.key), ["b1"]);
  assert.deepEqual(b.maybes, []);
  assert.deepEqual(b.rest, []);
});

test("fmtUntil", () => {
  assert.equal(fmtUntil(20000), "now");
  assert.equal(fmtUntil(12 * MIN), "in 12 min");
  assert.equal(fmtUntil(95 * MIN), "in 1 h 35 min");
  assert.equal(fmtUntil(-5000), "now");
});
