// HTML-escape all schedule-sourced text before innerHTML.

const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => MAP[c]);

// Category chips for an event: track, type (when it says more than the
// default "session"), language. Empty string when the event has none.
export function eventTags(ev) {
  const tags = [ev.track, ev.type !== "session" ? ev.type : "", ev.language].filter(Boolean);
  if (!tags.length) return "";
  return `<span class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>`;
}
