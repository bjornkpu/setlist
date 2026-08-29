// Plan state machine. Pure; no DOM, no storage. Terms: CONTEXT.md.

export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function stateOf(entries, key) {
  return entries[key] ?? "";
}

// Pure: returns a new entries object; the input is never mutated.
// A pick demotes every existing pick on an overlapping event to maybe (spec:
// at most one pick per overlapping range) and reports them as replacedKeys.
export function setState(entries, event, newState, allEvents) {
  const next = { ...entries };
  const replacedKeys = [];
  if (newState === "pick") {
    for (const other of allEvents) {
      if (other.key !== event.key && next[other.key] === "pick" && overlaps(event, other)) {
        replacedKeys.push(other.key);
        next[other.key] = "maybe";
      }
    }
  }
  if (newState) next[event.key] = newState;
  else delete next[event.key];
  return { entries: next, replacedKeys };
}
