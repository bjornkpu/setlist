// Provider index handling (REQUIREMENTS 4.4). Pure helpers + one fetch.

export function resolveProviderUrl(input) {
  const url = input.trim();
  if (url.endsWith(".json")) return url;
  return url.endsWith("/") ? `${url}index.json` : `${url}/index.json`;
}

export function parseIndex(json, baseUrl) {
  const name = typeof json?.name === "string" ? json.name : "";
  const raw = Array.isArray(json?.schedules) ? json.schedules : [];
  const schedules = [];
  for (const s of raw) {
    if (!s || typeof s !== "object" || typeof s.url !== "string" || !s.url) continue;
    let url;
    try {
      url = new URL(s.url, baseUrl).href;
    } catch {
      continue;
    }
    schedules.push({
      id: String(s.id ?? s.url),
      title: String(s.title ?? s.id ?? s.url),
      start: typeof s.start === "string" ? s.start : "",
      end: typeof s.end === "string" ? s.end : "",
      url,
    });
  }
  return { name, schedules };
}

// `end` >= today (or missing dates) counts as upcoming. ISO dates compare
// lexicographically.
export function splitByDate(schedules, todayStr) {
  const upcoming = schedules
    .filter((s) => !s.end || s.end >= todayStr)
    .sort((a, b) => a.start.localeCompare(b.start));
  const past = schedules
    .filter((s) => s.end && s.end < todayStr)
    .sort((a, b) => b.start.localeCompare(a.start));
  return { upcoming, past };
}

export async function fetchIndex(providerUrl) {
  const url = resolveProviderUrl(providerUrl);
  const res = await fetch(url, { cache: "no-store" }); // Pages sends max-age=600
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { url, ...parseIndex(await res.json(), url) };
}
