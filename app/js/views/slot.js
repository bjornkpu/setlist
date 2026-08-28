import { esc } from "../html.js";
import { slotFor } from "../glance.js";
import { cycle } from "../plan.js";
import { planStateOf, allEvents } from "../store.js";
import { applyState } from "../actions.js";

const ICON = { pick: "✓", maybe: "?", avoid: "✕", "": "+" };

export function renderSlot(app, state, key) {
  const events = allEvents();
  const ref = events.find((e) => e.key === key);
  if (!ref) {
    app.innerHTML = `<div class="pad"><p class="error">Slot not found.</p><p><a href="#/">‹ Now</a></p></div>`;
    return;
  }
  const b = slotFor(events, state.plan, ref);
  const section = (label, list) =>
    list.length
      ? `<h2>${label}</h2><ul class="events">${list.map(row).join("")}</ul>`
      : "";
  app.innerHTML = `
    <div class="slot">
      <header class="bar">
        <a href="#/">‹ Now</a>
        <h1>${esc(ref.startLabel)}–${esc(ref.endLabel)}</h1>
      </header>
      ${section("Picked", b.picks)}
      ${section("Maybe", b.maybes)}
      ${section("Everything else", b.rest)}
      ${section("Avoided", b.avoided)}
    </div>`;
  app.querySelector(".slot").addEventListener("click", (e) => {
    const btn = e.target.closest(".plan-btn");
    if (!btn) return;
    applyState(btn.dataset.key, cycle(planStateOf(btn.dataset.key)), () =>
      renderSlot(app, state, key),
    ).catch(console.error);
  });
}

function row(e) {
  const st = planStateOf(e.key);
  return `<li class="state-${st || "none"}">
    <a href="#/event/${encodeURIComponent(e.key)}">
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      ${e.persons.length ? `<span class="who">${esc(e.persons.join(", "))}</span>` : ""}
    </a>
    <button class="plan-btn" data-key="${esc(e.key)}"
      aria-label="Plan state: ${esc(st || "none")}">${ICON[st] ?? "+"}</button>
  </li>`;
}
