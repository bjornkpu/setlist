// Glance resolution: where do I go now / next. Pure; no DOM. Terms: CONTEXT.md.

import { overlaps, stateOf } from "./plan.js";

// A solo event is the only thing running during its range, judged against
// ALL events — the rule is about the schedule's shape, not the plan.
function isSolo(ev, events) {
  return events.every((o) => o.key === ev.key || o.end <= o.start || !overlaps(o, ev));
}

// Destination among `candidates`: an overlapping pick wins; else a
// non-avoided solo event; else null.
function destination(candidates, events, plan) {
  const pick = candidates.find((e) => stateOf(plan, e.key) === "pick");
  if (pick) return pick;
  return candidates.find((e) => stateOf(plan, e.key) !== "avoid" && isSolo(e, events)) ?? null;
}

export function slotEvents(events, ref) {
  return events.filter((e) => e.key === ref.key || overlaps(e, ref));
}

export function resolveGlance(events, plan, now) {
  if (!events.length) {
    return { phase: "empty", current: null, next: null, firstStart: 0, lastEnd: 0 };
  }
  const firstStart = Math.min(...events.map((e) => e.start));
  const lastEnd = Math.max(...events.map((e) => e.end));
  const active = events.filter((e) => e.start <= now && now < e.end);
  const activeDest = active.length ? destination(active, events, plan) : null;
  const upcoming = events
    .filter((e) => e.start > now && stateOf(plan, e.key) !== "avoid")
    .sort((a, b) => a.start - b.start || a.room.localeCompare(b.room));
  const nextRef = upcoming[0] ?? null;
  const nextDest = nextRef
    ? destination(slotEvents(events, nextRef).filter((e) => e.start > now), events, plan)
    : null;
  const phase = now < firstStart ? "before" : now >= lastEnd ? "after" : "during";
  return {
    phase,
    // active[0] leans on caller-sorted events; safe — same-instant ties only, and picks win via destination()
    current: active.length ? { dest: activeDest, ref: activeDest ?? active[0] } : null,
    next: nextRef ? { dest: nextDest, ref: nextDest ?? nextRef } : null,
    firstStart,
    lastEnd,
  };
}

export function slotFor(events, plan, ref) {
  const slot = slotEvents(events, ref).sort(
    (a, b) => a.start - b.start || a.room.localeCompare(b.room),
  );
  const buckets = { picks: [], maybes: [], rest: [], avoided: [] };
  for (const e of slot) {
    const st = stateOf(plan, e.key);
    if (st === "pick") buckets.picks.push(e);
    else if (st === "maybe") buckets.maybes.push(e);
    else if (st === "avoid") buckets.avoided.push(e);
    else buckets.rest.push(e);
  }
  return buckets;
}

// Chronological agenda for one day's events: an entry per pick and per
// non-avoided solo event (each with a count of overlapping maybes), plus one
// entry per cluster of maybes that overlap no pick/solo — a contested slot
// with nothing picked yet.
export function dayAgenda(events, plan) {
  const sorted = [...events]
    .filter((e) => e.end > e.start)
    .sort((a, b) => a.start - b.start || a.room.localeCompare(b.room));
  const entries = [];
  const claimed = new Set();
  for (const e of sorted) {
    const st = stateOf(plan, e.key);
    const anchor = st === "pick" || (st !== "avoid" && isSolo(e, events));
    if (!anchor) continue;
    const maybes = sorted.filter(
      (m) => m.key !== e.key && stateOf(plan, m.key) === "maybe" && overlaps(m, e),
    );
    for (const m of maybes) claimed.add(m.key);
    claimed.add(e.key);
    entries.push({ kind: st === "pick" ? "pick" : "solo", event: e, maybeCount: maybes.length });
  }
  let cluster = null;
  for (const m of sorted) {
    if (stateOf(plan, m.key) !== "maybe" || claimed.has(m.key)) continue;
    if (cluster && m.start < cluster.end) {
      cluster.events.push(m);
      cluster.end = Math.max(cluster.end, m.end);
    } else {
      cluster = { kind: "maybes", events: [m], end: m.end };
      entries.push(cluster);
    }
  }
  return entries.sort(
    (a, b) => (a.event?.start ?? a.events[0].start) - (b.event?.start ?? b.events[0].start),
  );
}

export function fmtUntil(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `in ${min} min`;
  return `in ${Math.floor(min / 60)} h ${min % 60} min`;
}
