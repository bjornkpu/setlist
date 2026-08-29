import { esc, eventTags } from "../html.js";
import { planStateOf } from "../store.js";
import { applyState } from "../actions.js";
import { attachSwipe } from "../swipe.js";
import { header } from "./header.js";
import { browseList } from "./browse.js";

// Direction of the pending prev/next step: go() sets it, the re-render
// triggered by the hash change consumes it as the entry animation.
let pendingDir = null;
let lastKey = null;

export function renderEvent(app, state, key) {
  // The audit queue is the browse list as currently filtered (day, room,
  // tracks, search, undecided); an event outside it falls back to all events.
  let seq = browseList(state.model.days[state.browse.dayIndex], state.browse);
  let i = seq.findIndex((e) => e.key === key);
  if (i === -1) {
    seq = state.model.days.flatMap((d) => d.events);
    i = seq.findIndex((e) => e.key === key);
  }
  const ev = seq[i];
  if (!ev) {
    app.innerHTML = `<div class="pad">
      <p class="error">Session not found.</p>
      <p><a href="#/browse">‹ Back</a></p>
    </div>`;
    return;
  }
  const dir = pendingDir;
  pendingDir = null;
  if (key !== lastKey) window.scrollTo(0, 0);
  lastKey = key;
  const prev = seq[i - 1];
  const next = seq[i + 1];
  // replace, not push: prev/next audit steps stay off the history stack, so
  // Back (button or system) always returns to the list
  const go = (target, d) => {
    if (!target) return;
    pendingDir = d;
    location.replace(`#/event/${encodeURIComponent(target.key)}`);
  };
  const current = planStateOf(ev.key);
  const para = (text, cls) =>
    text ? `<p class="${cls}">${esc(text).replaceAll("\n", "<br>")}</p>` : "";
  const stateBtn = (value, label) =>
    `<button data-state="${value}" class="b-${value} ${current === value ? "active" : ""}">${label}</button>`;
  const date = state.model.days[ev.dayIndex]?.date ?? "";
  app.innerHTML = `
    ${header(state.model.title, "")}
    <div class="pad detail${dir ? ` enter-${dir}` : ""}">
      <p class="detail-nav">
        <a href="#/browse">‹ Back</a>
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
      ${stateBtn("avoid", "Avoid")}${stateBtn("maybe", "Maybe")}${stateBtn("pick", "Pick")}
    </div>`;
  app.querySelector(".actionbar").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-state]");
    if (!btn) return;
    const value = btn.dataset.state;
    const newState = planStateOf(ev.key) === value ? "" : value; // tap active state to clear
    // choosing a state advances the audit queue; clearing (or the last
    // session) re-renders in place
    const after =
      newState && next ? () => go(next, "next") : () => renderEvent(app, state, key);
    applyState(ev.key, newState, after).catch(console.error);
  });
  app.querySelector(".nav-prev").addEventListener("click", () => go(prev, "prev"));
  app.querySelector(".nav-next").addEventListener("click", () => go(next, "next"));
  attachSwipe(app.querySelector(".detail"), null, {
    onLeft: () => go(next, "next"),
    onRight: () => go(prev, "prev"),
  });
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
