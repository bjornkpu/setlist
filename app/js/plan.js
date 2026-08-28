// Plan state machine. Pure; no DOM, no storage. Terms: CONTEXT.md.

const ORDER = ["", "pick", "maybe", "avoid"];

export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function stateOf(entries, key) {
  return entries[key] ?? "";
}

export function cycle(current) {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}

// Pure: returns a new entries object; the input is never mutated.
// A pick clears every existing pick on an overlapping event (spec: at most
// one pick per overlapping range) and reports them as replacedKeys.
export function setState(entries, event, newState, allEvents) {
  const next = { ...entries };
  const replacedKeys = [];
  if (newState === "pick") {
    for (const other of allEvents) {
      if (other.key !== event.key && next[other.key] === "pick" && overlaps(event, other)) {
        replacedKeys.push(other.key);
        delete next[other.key];
      }
    }
  }
  if (newState) next[event.key] = newState;
  else delete next[event.key];
  return { entries: next, replacedKeys };
}
