// Browse-view filtering. Pure; no DOM.
import { splitTrack } from "./schedule.js";

export function filterEvents(events, { room = "", tracks = [], q = "" } = {}) {
  const needle = q.trim().toLowerCase();
  return events.filter(
    (e) =>
      (!room || e.room === room) &&
      // any selected topic matches (union, not intersection)
      (!tracks.length || splitTrack(e.track).some((t) => tracks.includes(t))) &&
      (!needle ||
        e.title.toLowerCase().includes(needle) ||
        e.persons.some((p) => p.toLowerCase().includes(needle)) ||
        e.abstract.toLowerCase().includes(needle)),
  );
}
