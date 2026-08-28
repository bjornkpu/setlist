import { esc } from "../html.js";

export function renderEvent(app, state, key) {
  const ev = state.model.days.flatMap((d) => d.events).find((e) => e.key === key);
  if (!ev) {
    app.innerHTML = `<div class="pad">
      <p class="error">Session not found.</p>
      <p><a href="#/browse">‹ Program</a></p>
    </div>`;
    return;
  }
  const para = (text, cls) =>
    text ? `<p class="${cls}">${esc(text).replaceAll("\n", "<br>")}</p>` : "";
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
      ${ev.persons.length ? `<p class="who">${esc(ev.persons.join(", "))}</p>` : ""}
      ${para(ev.abstract, "abstract")}
      ${para(ev.description, "description")}
    </div>`;
}
