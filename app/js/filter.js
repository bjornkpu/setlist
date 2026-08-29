// Browse-view filtering. Pure; no DOM.
import { splitTrack } from "./schedule.js";

export function filterEvents(events, { room = "", track = "", q = "" } = {}) {
  const needle = q.trim().toLowerCase();
  return events.filter(
    (e) =>
      (!room || e.room === room) &&
      (!track || splitTrack(e.track).includes(track)) &&
      (!needle ||
        e.title.toLowerCase().includes(needle) ||
        e.persons.some((p) => p.toLowerCase().includes(needle)) ||
        e.abstract.toLowerCase().includes(needle)),
  );
}
