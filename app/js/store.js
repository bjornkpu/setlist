// App state + actions. Views read state and call actions; main.js routes.

import { normalize } from "./schedule.js";
import { setState as planSetState, stateOf } from "./plan.js";
import { dbGet, dbGetAll, dbPut, dbDelete } from "./db.js";
import { getSetting, setSetting } from "./settings.js";
import { now } from "./clock.js";
import { resolveProviderUrl } from "./providers.js";

export const DEFAULT_PROVIDER = "https://bjornkpu.github.io/setlist/conferences/";

export const state = {
  model: null,      // normalized schedule
  scheduleKey: "",  // IndexedDB key for schedules + plans records
  sourceUrl: "",    // display label: URL, or file name for imports
  plan: {},         // eventKey -> "pick" | "maybe" | "avoid"
  browse: { dayIndex: 0, room: "", tracks: [], q: "", undecided: false, dayPinned: false },
};

export function scheduleKeyFor(json, url, fromFile) {
  if (!fromFile) return url;
  const conf = json?.schedule?.conference ?? {};
  return `file:${conf.acronym || conf.title || "schedule"}:${conf.start || ""}`;
}

export function defaultDayIndex(model, nowMs) {
  const inWindow = model.days.findIndex((d) => d.dayStart <= nowMs && nowMs < d.dayEnd);
  if (inWindow !== -1) return inWindow;
  const today = new Date(nowMs).toLocaleDateString("sv-SE"); // sv-SE = YYYY-MM-DD, local time
  const byDate = model.days.findIndex((d) => d.date === today);
  return byDate === -1 ? 0 : byDate;
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
  state.browse = { dayIndex: defaultDayIndex(model, now()), room: "", tracks: [], q: "", undecided: false, dayPinned: false };
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
      loadedAt: Date.now(), // wall clock on purpose: storage timestamp, not schedule time
    });
    setSetting("activeSchedule", key);
  } catch {
    // storage unavailable: keep running in-memory
  }
}

// Selection policy (spec decision 3): the schedule covering today wins, else
// the remembered active one, else the most recently loaded. Pure.
export function pickSchedule(records, nowMs, activeKey) {
  if (!records?.length) return null;
  const today = new Date(nowMs).toLocaleDateString("sv-SE");
  return (
    records.find((s) => s.start && s.end && s.start <= today && today <= s.end) ??
    records.find((s) => s.key === activeKey) ??
    records.reduce((a, b) => ((a.loadedAt ?? 0) >= (b.loadedAt ?? 0) ? a : b))
  );
}

export async function activateRecord(record) {
  await activate(record.json, {
    url: record.url,
    fromFile: record.key.startsWith("file:"),
    label: record.key,
  });
}

export async function restoreLast() {
  let all;
  try {
    all = await dbGetAll("schedules");
  } catch {
    return false;
  }
  const record = pickSchedule(all, now(), getSetting("activeSchedule"));
  if (!record) return false;
  try {
    await activateRecord(record);
    return true;
  } catch {
    return false; // cached record no longer parses; leave load screen
  }
}

// Deletes the schedule and its plan (spec 5.4 — caller confirms first).
export async function removeSchedule(key) {
  try {
    await dbDelete("schedules", key);
  } catch {
    // storage unavailable; nothing to remove
  }
  try {
    await dbDelete("plans", key);
  } catch {
    // storage unavailable; nothing to remove
  }
  if (getSetting("activeSchedule") === key) setSetting("activeSchedule", "");
  if (state.scheduleKey === key) {
    state.model = null;
    state.scheduleKey = "";
    state.sourceUrl = "";
    state.plan = {};
    await restoreLast(); // another cached schedule takes over if one exists
  }
}

export async function listProviders() {
  let stored = [];
  try {
    stored = await dbGetAll("providers");
  } catch {
    // storage unavailable
  }
  const list = [];
  if (getSetting("defaultProviderRemoved") !== "yes") {
    list.push({ key: DEFAULT_PROVIDER, url: DEFAULT_PROVIDER, name: "setlist default", builtin: true });
  }
  return [...list, ...stored.filter((p) => resolveProviderUrl(p.key) !== resolveProviderUrl(DEFAULT_PROVIDER))];
}

export async function addProvider(url) {
  if (resolveProviderUrl(url) === resolveProviderUrl(DEFAULT_PROVIDER)) {
    setSetting("defaultProviderRemoved", ""); // re-adding the built-in restores it
    return;
  }
  try {
    await dbPut("providers", { key: url, url });
  } catch {
    // storage unavailable
  }
}

export async function removeProvider(provider) {
  if (provider.builtin) {
    setSetting("defaultProviderRemoved", "yes");
    return;
  }
  try {
    await dbDelete("providers", provider.key);
  } catch {
    // storage unavailable
  }
}

// Persist the display name a provider's index reported (first browse).
export async function rememberProviderName(key, name) {
  if (!name || key === DEFAULT_PROVIDER) return;
  try {
    await dbPut("providers", { key, url: key, name });
  } catch {
    // storage unavailable
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
