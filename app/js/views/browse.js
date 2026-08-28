import { esc } from "../html.js";
import { filterEvents } from "../filter.js";
import { cycle } from "../plan.js";
import { planStateOf } from "../store.js";
import { applyState } from "../actions.js";

const STATE_ICON = { pick: "✓", maybe: "?", avoid: "✕", "": "+" };

export function renderBrowse(app, state) {
  const { model, browse } = state;
  const day = model.days[browse.dayIndex] ?? model.days[0];
  app.innerHTML = `
    <header class="bar"><h1>${esc(model.title)}</h1><span class="bar-links"><a href="#/library">Library</a> <a class="now-link" href="#/">Now</a></span></header>
    ${model.days.length > 1 ? daySelector(model, browse) : ""}
    <div class="filters">
      ${select("room", "All rooms", model.rooms, browse.room)}
      ${model.tracks.length ? select("track", "All tracks", model.tracks, browse.track) : ""}
      <input type="search" id="q" placeholder="Search" value="${esc(browse.q)}">
    </div>
    <ul class="events">${list(day, browse)}</ul>`;
  wire(app, state);
}

function list(day, browse) {
  const events = filterEvents(day?.events ?? [], browse);
  return events.map(row).join("") || `<li class="status">No sessions match.</li>`;
}

function row(e) {
  const st = planStateOf(e.key);
  return `<li class="state-${st || "none"}">
    <a href="#/event/${encodeURIComponent(e.key)}">
      <span class="time">${esc(e.startLabel)}–${esc(e.endLabel)}</span>
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      ${e.persons.length ? `<span class="who">${esc(e.persons.join(", "))}</span>` : ""}
    </a>
    <button class="plan-btn" data-key="${esc(e.key)}"
      aria-label="Plan state: ${esc(st || "none")}">${STATE_ICON[st] ?? "+"}</button>
  </li>`;
}

function daySelector(model, browse) {
  return `<nav class="days">${model.days
    .map(
      (d, i) =>
        `<button data-day="${i}" class="${i === browse.dayIndex ? "active" : ""}">${esc(d.date)}</button>`,
    )
    .join("")}</nav>`;
}

function select(id, label, options, value) {
  return `<select id="${id}" aria-label="${esc(label)}">
    <option value="">${label}</option>
    ${options
      .map((o) => `<option ${o === value ? "selected" : ""} value="${esc(o)}">${esc(o)}</option>`)
      .join("")}
  </select>`;
}

function wire(app, state) {
  const rerenderList = () => {
    const ul = app.querySelector(".events");
    if (!ul) return;
    ul.innerHTML = list(
      state.model.days[state.browse.dayIndex] ?? state.model.days[0],
      state.browse,
    );
  };
  app.querySelector(".days")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-day]");
    if (!b) return;
    state.browse.dayIndex = Number(b.dataset.day);
    state.browse.dayPinned = true; // user chose a day: glance stops following
    renderBrowse(app, state);
  });
  for (const id of ["room", "track"]) {
    app.querySelector(`#${id}`)?.addEventListener("change", (e) => {
      state.browse[id] = e.target.value;
      renderBrowse(app, state);
    });
  }
  const q = app.querySelector("#q");
  q.addEventListener("input", () => {
    state.browse.q = q.value;
    rerenderList(); // list only, so the search input keeps focus
  });
  app.querySelector(".events").addEventListener("click", (e) => {
    const btn = e.target.closest(".plan-btn");
    if (!btn) return;
    applyState(btn.dataset.key, cycle(planStateOf(btn.dataset.key)), rerenderList).catch(console.error);
  });
}
