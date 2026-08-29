import { esc } from "../html.js";
import { resolveGlance, slotFor, fmtUntil, dayAgenda } from "../glance.js";
import { now } from "../clock.js";
import { allEvents, defaultDayIndex } from "../store.js";
import { attachSwipe } from "../swipe.js";

export function renderGlance(app, state) {
  const events = allEvents();
  const t = now();
  const g = resolveGlance(events, state.plan, t);
  // Keep browse pointed at the day the glance is showing, unless the user
  // pinned a day themselves (multi-day: glance may cross into day 2).
  if (!state.browse.dayPinned) {
    const ref = g.current?.ref ?? g.next?.ref;
    if (ref && ref.dayIndex !== state.browse.dayIndex) state.browse.dayIndex = ref.dayIndex;
  }
  const days = state.model.days;
  // "today": the day the clock falls in; before the event, the first day
  const todayIndex = defaultDayIndex(state.model, t);
  const dayIndex = Math.min(state.browse.dayIndex, days.length - 1);
  let top = "";
  if (g.phase === "empty") {
    top = `<p class="status">This schedule has no events.</p>`;
  } else if (dayIndex !== todayIndex) {
    top = ""; // viewing another day: agenda only, the big cards are about now
  } else if (g.phase === "after") {
    top = `<div class="closing"><p class="big">That's a wrap 🎉</p>
      <p class="status">${esc(state.model.title)} has ended.</p></div>`;
  } else {
    top = `${g.current ? card("Now", g.current, events, state.plan, t) : ""}
      ${g.next ? card(g.phase === "before" ? "First up" : "Next", g.next, events, state.plan, t) : ""}
      ${!g.current && !g.next ? `<p class="status">Nothing upcoming.</p>` : ""}`;
  }
  app.innerHTML = `
    <div class="glance">
      <a class="corner" href="#/browse" aria-label="Program">☰</a>
      ${days.length > 1 ? dayTabs(days, dayIndex, todayIndex) : ""}
      ${top}
      ${g.phase === "empty" ? "" : `<h2 class="agenda-h">Your day</h2>${agendaList(days[dayIndex]?.events ?? [], state.plan)}`}
    </div>`;
  const showDay = (i) => {
    if (i < 0 || i >= days.length) return;
    state.browse.dayIndex = i;
    state.browse.dayPinned = true; // user chose a day: glance stops following
    renderGlance(app, state);
  };
  app.querySelector(".days")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-day]");
    if (b) showDay(Number(b.dataset.day));
  });
  if (days.length > 1) {
    attachSwipe(app.querySelector(".glance"), null, {
      onLeft: () => showDay(dayIndex + 1),
      onRight: () => showDay(dayIndex - 1),
    });
  }
}

// "2026-09-16" -> "Wed 16 Sep" (UTC: the string is a plain calendar date)
function fmtDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = d.toLocaleDateString("en", { weekday: "short", timeZone: "UTC" });
  const mo = d.toLocaleDateString("en", { month: "short", timeZone: "UTC" });
  return `${wd} ${d.getUTCDate()} ${mo}`;
}

function dayTabs(days, dayIndex, todayIndex) {
  return `<nav class="days">${days
    .map(
      (d, i) =>
        `<button data-day="${i}" class="${i === dayIndex ? "active" : ""} ${i === todayIndex ? "today" : ""}">${esc(fmtDay(d.date))}</button>`,
    )
    .join("")}</nav>`;
}

function agendaList(dayEvents, plan) {
  const entries = dayAgenda(dayEvents, plan);
  if (!entries.length) {
    return `<p class="status">Nothing planned this day — <a href="#/browse">browse the program</a>.</p>`;
  }
  return `<ul class="events agenda">${entries.map(agendaEntry).join("")}</ul>`;
}

function agendaEntry(en) {
  if (en.kind === "maybes") {
    const first = en.events[0];
    const titles = en.events.map((e) => e.title).slice(0, 2).join(" · ");
    return `<li><a href="#/slot/${encodeURIComponent(first.key)}">
      <span class="time">${esc(first.startLabel)}<span class="end">${esc(first.endLabel)}</span></span>
      <span class="main">
        <span class="title">Nothing picked yet</span>
        <span class="who">${esc(titles)}${en.events.length > 2 ? " · …" : ""}</span>
      </span>
      <span class="badge">?&nbsp;${en.events.length}</span>
    </a></li>`;
  }
  const e = en.event;
  return `<li><a href="#/slot/${encodeURIComponent(e.key)}">
    <span class="time">${esc(e.startLabel)}<span class="end">${esc(e.endLabel)}</span></span>
    <span class="main">
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
    </span>
    ${en.maybeCount ? `<span class="badge">+${en.maybeCount}</span>` : ""}
  </a></li>`;
}

function card(label, group, events, plan, t) {
  const href = `#/slot/${encodeURIComponent(group.ref.key)}`;
  const untilLine =
    label === "Now"
      ? `ends ${esc(group.ref.endLabel)}`
      : `${esc(group.ref.startLabel)} · ${esc(fmtUntil(group.ref.start - t))}`;
  const b = slotFor(events, plan, group.ref);
  if (group.dest) {
    const e = group.dest;
    const alts = b.maybes.filter((m) => m.key !== e.key).length;
    return `<a class="card ${label === "Now" ? "primary" : "secondary"}" href="${href}">
      <span class="label">${label}</span>
      <span class="room">${esc(e.room)}</span>
      <span class="title">${esc(e.title)}</span>
      <span class="until">${untilLine}${alts ? ` · ${alts} maybe${alts > 1 ? "s" : ""} in this slot` : ""}</span>
    </a>`;
  }
  // No pick for this slot: say so, offer maybes, then the full slot (spec §5.1)
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
