import { esc } from "../html.js";
import { planStateOf } from "../store.js";
import { applyState } from "./browse.js";

export function renderEvent(app, state, key) {
  const ev = state.model.days.flatMap((d) => d.events).find((e) => e.key === key);
  if (!ev) {
    app.innerHTML = `<div class="pad">
      <p class="error">Session not found.</p>
      <p><a href="#/browse">‹ Program</a></p>
    </div>`;
    return;
  }
  const current = planStateOf(ev.key);
  const para = (text, cls) =>
    text ? `<p class="${cls}">${esc(text).replaceAll("\n", "<br>")}</p>` : "";
  const stateBtn = (value, label) =>
    `<button data-state="${value}" class="${current === value ? "active" : ""}">${label}</button>`;
  app.innerHTML = `
    <div class="pad detail">
      <p><a href="#/browse">‹ Program</a></p>
      <h1>${esc(ev.title)}</h1>
      ${ev.subtitle ? `<p class="subtitle">${esc(ev.subtitle)}</p>` : ""}
      <p class="meta">
        ${esc(ev.startLabel)}–${esc(ev.endLabel)}
        · <span class="room">${esc(ev.room)}</span>
        ${ev.track ? `· ${esc(ev.track)}` : ""}
      </p>
      <div class="plan-states" role="group" aria-label="Plan state">
        ${stateBtn("pick", "Pick")}${stateBtn("maybe", "Maybe")}${stateBtn("avoid", "Avoid")}
      </div>
      ${ev.persons.length ? `<p class="who">${esc(ev.persons.join(", "))}</p>` : ""}
      ${para(ev.abstract, "abstract")}
      ${para(ev.description, "description")}
    </div>`;
  app.querySelector(".plan-states").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-state]");
    if (!btn) return;
    const value = btn.dataset.state;
    const next = planStateOf(ev.key) === value ? "" : value; // tap active state to clear
    applyState(ev.key, next, () => renderEvent(app, state, key));
  });
}
