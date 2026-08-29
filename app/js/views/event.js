import { esc, eventTags } from "../html.js";
import { planStateOf } from "../store.js";
import { applyState } from "../actions.js";
import { attachSwipe } from "../swipe.js";

export function renderEvent(app, state, key) {
  const seq = state.model.days.flatMap((d) => d.events);
  const i = seq.findIndex((e) => e.key === key);
  const ev = seq[i];
  if (!ev) {
    app.innerHTML = `<div class="pad">
      <p class="error">Session not found.</p>
      <p><a href="#/browse" data-back>‹ Back</a></p>
    </div>`;
    wireBack(app);
    return;
  }
  const prev = seq[i - 1];
  const next = seq[i + 1];
  const go = (target) => {
    if (target) location.hash = `#/event/${encodeURIComponent(target.key)}`;
  };
  const current = planStateOf(ev.key);
  const para = (text, cls) =>
    text ? `<p class="${cls}">${esc(text).replaceAll("\n", "<br>")}</p>` : "";
  const stateBtn = (value, label) =>
    `<button data-state="${value}" class="b-${value} ${current === value ? "active" : ""}">${label}</button>`;
  const date = state.model.days[ev.dayIndex]?.date ?? "";
  app.innerHTML = `
    <div class="pad detail">
      <p class="detail-nav">
        <a href="#/browse" data-back>‹ Back</a>
        <span class="pos">
          <button class="nav-prev" ${prev ? "" : "disabled"} aria-label="Previous session">‹</button>
          <span>${i + 1} / ${seq.length}</span>
          <button class="nav-next" ${next ? "" : "disabled"} aria-label="Next session">›</button>
        </span>
      </p>
      <h1>${esc(ev.title)}</h1>
      ${ev.subtitle ? `<p class="subtitle">${esc(ev.subtitle)}</p>` : ""}
      <p class="meta">
        ${esc(ev.startLabel)}–${esc(ev.endLabel)}
        · <span class="room">${esc(ev.room)}</span>
        ${date ? `· ${esc(date)}` : ""}
      </p>
      ${eventTags(ev)}
      ${ev.persons.length ? `<p class="who">${esc(ev.persons.join(", "))}</p>` : ""}
      ${para(ev.abstract, "abstract")}
      ${para(ev.description, "description")}
      ${linkList(ev.links)}
    </div>
    <div class="actionbar" role="group" aria-label="Plan state">
      ${stateBtn("pick", "Pick")}${stateBtn("maybe", "Maybe")}${stateBtn("avoid", "Avoid")}
    </div>`;
  app.querySelector(".actionbar").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-state]");
    if (!btn) return;
    const value = btn.dataset.state;
    const next = planStateOf(ev.key) === value ? "" : value; // tap active state to clear
    applyState(ev.key, next, () => renderEvent(app, state, key)).catch(console.error);
  });
  app.querySelector(".nav-prev").addEventListener("click", () => go(prev));
  app.querySelector(".nav-next").addEventListener("click", () => go(next));
  attachSwipe(app.querySelector(".detail"), null, {
    onLeft: () => go(next),
    onRight: () => go(prev),
  });
  wireBack(app);
}

// frab links are [{url, title}] or plain strings; schedule-sourced, so escape.
function linkList(links) {
  const items = links
    .map((l) => (typeof l === "string" ? { url: l, title: l } : l))
    .filter((l) => l && typeof l.url === "string" && /^https?:/.test(l.url));
  if (!items.length) return "";
  return `<ul class="links">${items
    .map(
      (l) =>
        `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a></li>`,
    )
    .join("")}</ul>`;
}

function wireBack(app) {
  app.querySelector("[data-back]")?.addEventListener("click", (e) => {
    if (history.length > 1) {
      e.preventDefault();
      history.back(); // return to slot/browse/wherever we came from
    }
  });
}
