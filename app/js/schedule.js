// frab schedule.json -> normalized model. Pure; no DOM. Terms: CONTEXT.md.

const HHMM = /^\d{1,2}:[0-5]\d$/;

export function addDuration(start, duration) {
  const [sh, sm] = start.split(":").map(Number);
  const [dh, dm] = duration.split(":").map(Number);
  const total = (sh * 60 + sm + dh * 60 + dm) % (24 * 60);
  const h = String(Math.trunc(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function normalize(root) {
  const conf = root?.schedule?.conference;
  if (!conf || typeof conf !== "object") {
    throw new Error("Not a frab schedule.json: missing schedule.conference");
  }
  if (!Array.isArray(conf.days) || conf.days.length === 0) {
    throw new Error("Not a frab schedule.json: no conference days");
  }
  const rooms = [];
  const tracks = new Set();
  const days = conf.days.map((day, di) => {
    const events = [];
    for (const [room, list] of Object.entries(day?.rooms ?? {})) {
      if (!Array.isArray(list)) continue;
      if (!rooms.includes(room)) rooms.push(room);
      for (const raw of list) {
        const ev = normalizeEvent(raw, room, di);
        if (ev) events.push(ev);
      }
    }
    events.sort((a, b) => a.start - b.start || a.room.localeCompare(b.room));
    for (const ev of events) if (ev.track) tracks.add(ev.track);
    return {
      index: day?.index ?? di,
      date: day?.date ?? "",
      dayStart: day?.day_start ?? "",
      dayEnd: day?.day_end ?? "",
      events,
    };
  });
  return {
    title: conf.title ?? "",
    start: conf.start ?? "",
    end: conf.end ?? "",
    days,
    rooms,
    tracks: [...tracks].sort((a, b) => a.localeCompare(b)),
  };
}

function normalizeEvent(raw, room, dayIndex) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const key = String(raw.guid || raw.id || "");
  if (!key) return null;
  const parsed = Date.parse(raw.date ?? "");
  if (Number.isNaN(parsed)) return null;
  const start = parsed;
  const duration = HHMM.test(raw.duration ?? "") ? raw.duration : "00:00";
  const [dh, dm] = duration.split(":").map(Number);
  const startLabel = HHMM.test(raw.start ?? "") ? raw.start : "";
  return {
    key,
    dayIndex,
    start,
    end: start + (dh * 60 + dm) * 60000,
    startLabel,
    endLabel: startLabel ? addDuration(startLabel, duration) : "",
    room,
    title: String(raw.title ?? ""),
    subtitle: String(raw.subtitle ?? ""),
    track: String(raw.track ?? ""),
    type: String(raw.type ?? ""),
    language: String(raw.language ?? ""),
    persons: (Array.isArray(raw.persons) ? raw.persons : [])
      .map((p) => String(p?.public_name ?? ""))
      .filter(Boolean),
    abstract: String(raw.abstract ?? ""),
    description: String(raw.description ?? ""),
    links: Array.isArray(raw.links) ? raw.links : [],
  };
}
