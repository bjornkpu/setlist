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

test("track filter", () => {
  assert.deepEqual(filterEvents(evs, { track: "Spor 1" }).map((e) => e.title), ["Copilot i praksis"]);
});

test("search matches title, speaker, abstract, case-insensitively", () => {
  assert.equal(filterEvents(evs, { q: "copilot" }).length, 1);
  assert.equal(filterEvents(evs, { q: "gullen" }).length, 1);
  assert.equal(filterEvents(evs, { q: "agent" }).length, 1);
  assert.equal(filterEvents(evs, { q: "  " }).length, 3);
  assert.equal(filterEvents(evs, { q: "zzz" }).length, 0);
});
