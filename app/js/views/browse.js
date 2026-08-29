import { esc, eventTags } from "../html.js";
import { filterEvents } from "../filter.js";
import { planStateOf, defaultDayIndex } from "../store.js";
import { applyState } from "../actions.js";
import { attachSwipe } from "../swipe.js";
import { now } from "../clock.js";
import { header, dayTabs } from "./header.js";

const STATE_ICON = { pick: "✓", maybe: "?", avoid: "✕", "": "+" };
const STATE_LABEL = { pick: "✓ Pick", maybe: "? Maybe", avoid: "✕ Avoid" };

export function renderBrowse(app, state) {
  const { model, browse } = state;
  const day = model.days[browse.dayIndex] ?? model.days[0];
  app.innerHTML = `
    ${header(model.title, "browse")}
    ${dayTabs(model.days, browse.dayIndex, defaultDayIndex(model, now()))}
    <div class="filters">
      ${select("room", "All rooms", model.rooms, browse.room)}
      <button id="undecided" class="${browse.undecided ? "active" : ""}"
        aria-pressed="${browse.undecided}">Undecided</button>
      <input type="search" id="q" placeholder="Search" value="${esc(browse.q)}">
    </div>
    ${trackChips(model, browse)}
    <ul class="events">${list(day, browse)}</ul>`;
  wire(app, state);
}

// The filtered browse list doubles as the detail view's audit queue.
export function browseList(day, browse) {
  let events = filterEvents(day?.events ?? [], browse);
  if (browse.undecided) events = events.filter((e) => !planStateOf(e.key));
  return events;
}

function list(day, browse) {
  return browseList(day, browse).map(row).join("") || `<li class="status">No sessions match.</li>`;
}

function row(e) {
  const st = planStateOf(e.key);
  return `<li class="state-${st || "none"}" data-key="${esc(e.key)}">
    <a href="#/event/${encodeURIComponent(e.key)}">
      <span class="time">${esc(e.startLabel)}<span class="end">${esc(e.endLabel)}</span></span>
      <span class="main">
        <span class="room">${esc(e.room)}</span>
        <span class="title">${esc(e.title)}</span>
        ${e.persons.length ? `<span class="who">${esc(e.persons.join(", "))}</span>` : ""}
        ${eventTags(e)}
      </span>
    </a>
    <button class="plan-btn" data-key="${esc(e.key)}"
      aria-label="Plan state: ${esc(st || "none")}">${STATE_ICON[st] ?? "+"}</button>
  </li>`;
}

// Toggleable topic chips: selecting several shows sessions matching ANY of them.
function trackChips(model, browse) {
  if (!model.tracks.length) return "";
  return `<div class="track-chips">${model.tracks
    .map(
      (t) =>
        `<button data-track="${esc(t)}" class="${browse.tracks.includes(t) ? "active" : ""}"
          aria-pressed="${browse.tracks.includes(t)}">${esc(t)}</button>`,
    )
    .join("")}</div>`;
}

function select(id, label, options, value) {
  return `<select id="${id}" aria-label="${esc(label)}">
    <option value="">${label}</option>
    ${options
      .map((o) => `<option ${o === value ? "selected" : ""} value="${esc(o)}">${esc(o)}</option>`)
      .join("")}
  </select>`;
}

// Tap the state button -> an inline chooser with the three states, so no
// cycling. Chooser markup is transient: any list re-render drops it.
function openChooser(li) {
  const open = li.querySelector(".choose");
  for (const c of li.closest("ul").querySelectorAll(".choose")) c.remove();
  if (open) return; // second tap on the same row: just close
  const st = planStateOf(li.dataset.key);
  const div = document.createElement("div");
  div.className = "choose";
  div.innerHTML = ["pick", "maybe", "avoid"]
    .map(
      (v) =>
        `<button data-state="${v}" class="c-${v} ${st === v ? "active" : ""}">${STATE_LABEL[v]}</button>`,
    )
    .join("");
  li.appendChild(div);
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
  // set state, tapping the row's current state clears it
  const toggleState = (key, value) => {
    const next = planStateOf(key) === value ? "" : value;
    applyState(key, next, rerenderList).catch(console.error);
  };
  app.querySelector(".days")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-day]");
    if (!b) return;
    state.browse.dayIndex = Number(b.dataset.day);
    state.browse.dayPinned = true; // user chose a day: glance stops following
    renderBrowse(app, state);
  });
  app.querySelector("#room")?.addEventListener("change", (e) => {
    state.browse.room = e.target.value;
    renderBrowse(app, state);
  });
  app.querySelector("#undecided").addEventListener("click", () => {
    state.browse.undecided = !state.browse.undecided;
    renderBrowse(app, state);
  });
  app.querySelector(".track-chips")?.addEventListener("click", (e) => {
    const chip = e.target.closest("button[data-track]");
    if (!chip) return;
    const t = chip.dataset.track;
    const on = state.browse.tracks.includes(t);
    state.browse.tracks = on
      ? state.browse.tracks.filter((x) => x !== t)
      : [...state.browse.tracks, t];
    chip.classList.toggle("active", !on); // in place: keep the chip row's scroll position
    chip.setAttribute("aria-pressed", String(!on));
    rerenderList();
  });
  const q = app.querySelector("#q");
  q.addEventListener("input", () => {
    state.browse.q = q.value;
    rerenderList(); // list only, so the search input keeps focus
  });
  const ul = app.querySelector(".events");
  ul.addEventListener("click", (e) => {
    const btn = e.target.closest(".plan-btn");
    if (btn) {
      openChooser(btn.closest("li"));
      return;
    }
    const choice = e.target.closest(".choose button");
    if (choice) toggleState(choice.closest("li").dataset.key, choice.dataset.state);
  });
  attachSwipe(ul, "li[data-key]", {
    onRight: (li) => toggleState(li.dataset.key, "pick"),
    onLeft: (li) => toggleState(li.dataset.key, "avoid"),
  });
}
