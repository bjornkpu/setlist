import test from "node:test";
import assert from "node:assert/strict";
import { filterEvents } from "../app/js/filter.js";

const evs = [
  { room: "Sal 1", track: "Spor 1", title: "Copilot i praksis", persons: ["Kjetil Gullen"], abstract: "Agent-bygging" },
  { room: "Sal 2", track: "Spor 2", title: "Sikker kode", persons: ["Kari"], abstract: "" },
  { room: "Fellesareal", track: "", title: "Lunsj", persons: [], abstract: "" },
];

test("no filters returns everything", () => {
  assert.equal(filterEvents(evs, {}).length, 3);
  assert.equal(filterEvents(evs).length, 3);
});

test("room filter", () => {
  assert.deepEqual(filterEvents(evs, { room: "Sal 2" }).map((e) => e.title), ["Sikker kode"]);
});

test("track filter is a union over selected topics", () => {
  assert.deepEqual(filterEvents(evs, { tracks: ["Spor 1"] }).map((e) => e.title), ["Copilot i praksis"]);
  assert.equal(filterEvents(evs, { tracks: ["Spor 1", "Spor 2"] }).length, 2);
  assert.equal(filterEvents(evs, { tracks: [] }).length, 3);
});

test("track filter matches any topic of a comma-joined track", () => {
  const multi = [{ room: "R", track: "AI, Cloud", title: "x", persons: [], abstract: "" }];
  assert.equal(filterEvents(multi, { tracks: ["Cloud"] }).length, 1);
  assert.equal(filterEvents(multi, { tracks: ["Web"] }).length, 0);
});

test("search matches title, speaker, abstract, case-insensitively", () => {
  assert.equal(filterEvents(evs, { q: "copilot" }).length, 1);
  assert.equal(filterEvents(evs, { q: "gullen" }).length, 1);
  assert.equal(filterEvents(evs, { q: "agent" }).length, 1);
  assert.equal(filterEvents(evs, { q: "  " }).length, 3);
  assert.equal(filterEvents(evs, { q: "zzz" }).length, 0);
});
