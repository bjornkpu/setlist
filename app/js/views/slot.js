import { esc } from "../html.js";
import { slotFor } from "../glance.js";
import { planStateOf, allEvents } from "../store.js";
import { applyState } from "../actions.js";
import { attachSwipe } from "../swipe.js";
import { header } from "./header.js";
import { ICON } from "../icons.js";

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
    ${header(state.model.title, "now")}
    <div class="slot">
      <h1 class="slot-time">${esc(ref.startLabel)}–${esc(ref.endLabel)}</h1>
      ${section("Picked", b.picks)}
      ${section("Maybe", b.maybes)}
      ${section("Everything else", b.rest)}
      ${section("Avoided", b.avoided)}
    </div>`;
  const rerender = () => renderSlot(app, state, key);
  // same gestures as browse: swipe right = pick, left = avoid, swipe the
  // row's current state again to clear; the button toggles maybe
  const toggleState = (k, value) => {
    const next = planStateOf(k) === value ? "" : value;
    applyState(k, next, rerender).catch(console.error);
  };
  const slot = app.querySelector(".slot");
  slot.addEventListener("click", (e) => {
    const btn = e.target.closest(".plan-btn");
    if (btn) toggleState(btn.dataset.key, "maybe");
  });
  attachSwipe(slot, "li[data-key]", {
    onRight: (li) => toggleState(li.dataset.key, "pick"),
    onLeft: (li) => toggleState(li.dataset.key, "avoid"),
  });
}

function row(e) {
  const st = planStateOf(e.key);
  return `<li class="state-${st || "none"}" data-key="${esc(e.key)}">
    <a href="#/event/${encodeURIComponent(e.key)}">
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      ${e.persons.length ? `<span class="who">${esc(e.persons.join(", "))}</span>` : ""}
    </a>
    <button class="plan-btn" data-key="${esc(e.key)}"
      aria-label="Toggle maybe (now: ${esc(st || "none")})">${ICON[st] ?? ICON.maybe}</button>
  </li>`;
}
