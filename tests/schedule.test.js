import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalize, addDuration } from "../app/js/schedule.js";
import { filterEvents } from "../app/js/filter.js";

test("addDuration adds HH:MM durations", () => {
  assert.equal(addDuration("11:10", "00:50"), "12:00");
  assert.equal(addDuration("23:30", "01:00"), "00:30");
  assert.equal(addDuration("09:00", "01:00"), "10:00");
});

function fixture() {
  return {
    schedule: {
      conference: {
        title: "Test Conf",
        start: "2026-08-26",
        end: "2026-08-26",
        days: [
          {
            index: 0,
            date: "2026-08-26",
            day_start: "2026-08-26T08:00:00+02:00",
            day_end: "2026-08-26T18:00:00+02:00",
            rooms: {
              "Sal 1": [
                {
                  guid: "g1", id: 1, date: "2026-08-26T10:00:00+02:00",
                  start: "10:00", duration: "00:50", room: "Sal 1",
                  title: "B talk", track: "Spor 1",
                  persons: [{ id: 1, public_name: "Kari" }], abstract: "Om ting",
                },
                {
                  id: 2, date: "2026-08-26T09:00:00+02:00",
                  start: "09:00", duration: "00:50", room: "Sal 1", title: "A talk",
                },
              ],
              Fellesareal: [
                {
                  guid: "g3", id: 3, date: "2026-08-26T12:00:00+02:00",
                  start: "12:00", duration: "00:50", room: "Fellesareal", title: "Lunsj",
                },
              ],
            },
          },
        ],
      },
    },
  };
}

test("normalize builds sorted day events with defaults", () => {
  const m = normalize(fixture());
  assert.equal(m.title, "Test Conf");
  assert.equal(m.days.length, 1);
  const evs = m.days[0].events;
  assert.deepEqual(evs.map((e) => e.key), ["2", "g1", "g3"]); // start order; id fallback for key
  const b = evs[1];
  assert.equal(b.endLabel, "10:50");
  assert.equal(b.end - b.start, 50 * 60000);
  assert.deepEqual(b.persons, ["Kari"]);
  const anchor = evs[2];
  assert.deepEqual(anchor.persons, []); // missing persons -> []
  assert.equal(anchor.abstract, "");    // missing abstract -> ""
  assert.deepEqual(m.rooms, ["Sal 1", "Fellesareal"]);
  assert.deepEqual(m.tracks, ["Spor 1"]);
});

test("normalize skips junk events and tolerates junk room values", () => {
  const f = fixture();
  f.schedule.conference.days[0].rooms["Sal 1"].push("junk", null);
  f.schedule.conference.days[0].rooms["Broken"] = "not a list";
  const m = normalize(f);
  assert.equal(m.days[0].events.length, 3);
  assert.ok(!m.rooms.includes("Broken"));
});

test("normalize rejects non-frab JSON", () => {
  assert.throws(() => normalize({ foo: 1 }), /frab/);
});

test("normalize falls back to id when guid is empty string", () => {
  const f = fixture();
  f.schedule.conference.days[0].rooms["Sal 1"].push({
    guid: "", id: 9, date: "2026-08-26T11:00:00+02:00",
    start: "11:00", duration: "00:50", room: "Sal 1", title: "C talk",
  });
  const m = normalize(f);
  const c = m.days[0].events.find((e) => e.title === "C talk");
  assert.equal(c.key, "9");
});

test("normalize treats out-of-range duration as 00:00", () => {
  const f = fixture();
  f.schedule.conference.days[0].rooms["Sal 1"].push({
    guid: "g4", id: 4, date: "2026-08-26T13:00:00+02:00",
    start: "13:00", duration: "25:99", room: "Sal 1", title: "D talk",
  });
  const m = normalize(f);
  const d = m.days[0].events.find((e) => e.title === "D talk");
  assert.equal(d.end, d.start);
});

test("normalize drops events with an unparseable date", () => {
  const f = fixture();
  f.schedule.conference.days[0].rooms["Sal 1"].push({
    guid: "g5", id: 5, date: "garbage",
    start: "14:00", duration: "00:50", room: "Sal 1", title: "E talk",
  });
  const m = normalize(f);
  assert.ok(!m.days[0].events.some((e) => e.title === "E talk"));
});

test("normalize coerces non-string text fields", () => {
  const f = fixture();
  f.schedule.conference.days[0].rooms["Sal 1"].push({
    guid: "g6", id: 6, date: "2026-08-26T15:00:00+02:00",
    start: "15:00", duration: "00:50", room: "Sal 1", title: 42,
  });
  const m = normalize(f);
  const e = m.days[0].events.find((ev) => ev.key === "g6");
  assert.equal(e.title, "42");
  assert.doesNotThrow(() => filterEvents(m.days[0].events, { q: "4" }));
});

test("normalize rejects empty or missing conference days", () => {
  assert.throws(() => normalize({ schedule: { conference: { title: "x" } } }), /days/);
});

test("normalize handles the real Fagfestival schedule", async () => {
  const root = JSON.parse(
    await readFile(new URL("../conferences/fagfestival-2026.json", import.meta.url), "utf8"),
  );
  const m = normalize(root);
  assert.equal(m.days.length, 1);
  assert.equal(m.days[0].events.length, 48);
  assert.equal(m.rooms.length, 7);
  assert.equal(m.tracks.length, 6);
});

test("normalize exposes day bounds as epoch ms", () => {
  const m = normalize(fixture());
  const day = m.days[0];
  assert.equal(day.dayStart, Date.parse("2026-08-26T08:00:00+02:00"));
  assert.equal(day.dayEnd, Date.parse("2026-08-26T18:00:00+02:00"));
});
