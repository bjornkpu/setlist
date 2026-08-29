// Shared chrome: every view renders the same top bar (title + Now/Browse/
// Library, current view highlighted) and the same day-tab strip.
import { esc } from "../html.js";

export function header(title, active) {
  const link = (href, label, key) =>
    `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`;
  return `<header class="bar"><h1>${esc(title)}</h1><nav class="bar-links">
    ${link("#/", "Now", "now")}${link("#/browse", "Browse", "browse")}${link("#/library", "Library", "library")}
  </nav></header>`;
}

// "2026-09-16" -> {wd: "Wed", dt: "16 Sep"} (UTC: plain calendar date)
export function fmtDayParts(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { wd: iso, dt: "" };
  return {
    wd: d.toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }),
    dt: `${d.getUTCDate()} ${d.toLocaleDateString("en", { month: "short", timeZone: "UTC" })}`,
  };
}

export function dayTabs(days, dayIndex, todayIndex) {
  if (days.length < 2) return "";
  return `<nav class="days">${days
    .map((d, i) => {
      const { wd, dt } = fmtDayParts(d.date);
      return `<button data-day="${i}" class="${i === dayIndex ? "active" : ""} ${i === todayIndex ? "today" : ""}">
        <span class="wd">${esc(wd)}</span><span class="dt">${esc(dt)}</span>
      </button>`;
    })
    .join("")}</nav>`;
}
