import { esc } from "../html.js";
import { resolveGlance, slotFor, fmtUntil } from "../glance.js";
import { now } from "../clock.js";
import { allEvents } from "../store.js";

export function renderGlance(app, state) {
  const events = allEvents();
  const t = now();
  const g = resolveGlance(events, state.plan, t);
  let body;
  if (g.phase === "empty") {
    body = `<p class="status">This schedule has no events.</p>`;
  } else if (g.phase === "after") {
    body = `<div class="closing"><p class="big">That's a wrap 🎉</p>
      <p class="status">${esc(state.model.title)} has ended.</p></div>`;
  } else {
    body = `${g.current ? card("Now", g.current, events, state.plan, t) : ""}
      ${g.next ? card(g.phase === "before" ? "First up" : "Next", g.next, events, state.plan, t) : ""}
      ${!g.current && !g.next ? `<p class="status">Nothing upcoming.</p>` : ""}`;
  }
  app.innerHTML = `
    <div class="glance">
      <a class="corner" href="#/browse" aria-label="Program">☰</a>
      ${body}
    </div>`;
}

function card(label, group, events, plan, t) {
  const href = `#/slot/${encodeURIComponent(group.ref.key)}`;
  const untilLine =
    label === "Now"
      ? `ends ${esc(group.ref.endLabel)}`
      : `${esc(group.ref.startLabel)} · ${esc(fmtUntil(group.ref.start - t))}`;
  if (group.dest) {
    const e = group.dest;
    return `<a class="card ${label === "Now" ? "primary" : "secondary"}" href="${href}">
      <span class="label">${label}</span>
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      <span class="until">${untilLine}</span>
    </a>`;
  }
  // No pick for this slot: say so, offer maybes, then the full slot (spec §5.1)
  const b = slotFor(events, plan, group.ref);
  const all = [...b.maybes, ...b.rest];
  const options = all.slice(0, 3);
  const heading = options.length && options.every((e) => b.maybes.includes(e)) ? "your maybes" : "options";
  return `<a class="card ${label === "Now" ? "primary" : "secondary"} none" href="${href}">
    <span class="label">${label}</span>
    <span class="title">Nothing picked — ${heading}:</span>
    ${options
      .map(
        (e) => `<span class="option"><span class="room-sm">${esc(e.room)}</span> ${esc(e.title)}</span>`,
      )
      .join("")}
    ${all.length > 3 ? `<span class="option">…and ${all.length - 3} more</span>` : ""}
    <span class="until">${untilLine} · tap for the full slot</span>
  </a>`;
}
