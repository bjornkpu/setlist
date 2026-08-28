// App state + actions. Views read state and call actions; main.js routes.

import { normalize } from "./schedule.js";
import { setState as planSetState, stateOf } from "./plan.js";
import { dbGet, dbGetAll, dbPut } from "./db.js";
import { getSetting, setSetting } from "./settings.js";

export const state = {
  model: null,      // normalized schedule
  scheduleKey: "",  // IndexedDB key for schedules + plans records
  sourceUrl: "",    // display label: URL, or file name for imports
  plan: {},         // eventKey -> "pick" | "maybe" | "avoid"
  browse: { dayIndex: 0, room: "", track: "", q: "" },
};

export function scheduleKeyFor(json, url, fromFile) {
  if (!fromFile) return url;
  const conf = json?.schedule?.conference ?? {};
  return `file:${conf.acronym || conf.title || "schedule"}:${conf.start || ""}`;
}

function defaultDayIndex(model) {
  const today = new Date().toLocaleDateString("sv-SE"); // sv-SE = YYYY-MM-DD, local time
  const i = model.days.findIndex((d) => d.date === today);
  return i === -1 ? 0 : i;
}

export function allEvents() {
  return state.model ? state.model.days.flatMap((d) => d.events) : [];
}

// Throws if json is not a frab schedule — callers surface the message.
export async function activate(json, { url = "", fromFile = false, label = "" } = {}) {
  const model = normalize(json);
  const key = scheduleKeyFor(json, url, fromFile);
  state.model = model;
  state.scheduleKey = key;
  state.sourceUrl = url || label;
  state.browse = { dayIndex: defaultDayIndex(model), room: "", track: "", q: "" };
  state.plan = {};
  try {
    // read the plan BEFORE writing the schedule: if the read fails we stay
    // in-memory and never risk overwriting a stored plan with an empty one
    state.plan = (await dbGet("plans", key))?.entries ?? {};
    await dbPut("schedules", {
      key,
      url,
      json,
      title: model.title,
      start: model.start,
      end: model.end,
      loadedAt: Date.now(),
    });
    setSetting("activeSchedule", key);
  } catch {
    // storage unavailable: keep running in-memory
  }
}

// Boot without ?url=: activate the schedule covering today, else the last
// active one, else the most recently loaded. False if nothing is cached.
export async function restoreLast() {
  let all;
  try {
    all = await dbGetAll("schedules");
  } catch {
    return false;
  }
  if (!all?.length) return false;
  const today = new Date().toLocaleDateString("sv-SE");
  const record =
    all.find((s) => s.start && s.end && s.start <= today && today <= s.end) ??
    all.find((s) => s.key === getSetting("activeSchedule")) ??
    all.reduce((a, b) => (a.loadedAt >= b.loadedAt ? a : b));
  try {
    await activate(record.json, {
      url: record.url,
      fromFile: record.key.startsWith("file:"),
      label: record.key,
    });
    return true;
  } catch {
    return false; // cached record no longer parses; leave load screen
  }
}

// Returns the replaced picks' event keys when conflicts were resolved, else [].
export async function setPlanState(eventKey, newState) {
  const events = allEvents();
  const event = events.find((e) => e.key === eventKey);
  if (!event) return [];
  const { entries, replacedKeys } = planSetState(state.plan, event, newState, events);
  state.plan = entries;
  try {
    await dbPut("plans", { key: state.scheduleKey, entries });
  } catch {
    // in-memory only
  }
  return replacedKeys;
}

export function planStateOf(eventKey) {
  return stateOf(state.plan, eventKey);
}
