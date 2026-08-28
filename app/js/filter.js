// Browse-view filtering. Pure; no DOM.

export function filterEvents(events, { room = "", track = "", q = "" } = {}) {
  const needle = q.trim().toLowerCase();
  return events.filter(
    (e) =>
      (!room || e.room === room) &&
      (!track || e.track === track) &&
      (!needle ||
        e.title.toLowerCase().includes(needle) ||
        e.persons.some((p) => p.toLowerCase().includes(needle)) ||
        e.abstract.toLowerCase().includes(needle)),
  );
}
