// UI-facing actions shared by views. Terms: CONTEXT.md.
import { setPlanState, allEvents, activate } from "./store.js";
import { showToast } from "./toast.js";

// Apply a state change; `rerender` refreshes the originating view in place
// (kept as a callback so browse can do a list-only refresh that preserves
// search focus and scroll). A demoted pick gets an Undo toast; undo
// re-renders whatever view is current via the global event.
export async function applyState(eventKey, newState, rerender) {
  const replacedKeys = await setPlanState(eventKey, newState);
  rerender();
  if (replacedKeys.length) {
    const titles = replacedKeys
      .map((k) => allEvents().find((e) => e.key === k)?.title ?? "session");
    const message = titles.length === 1
      ? `Moved to maybe: ${titles[0]}`
      : `Moved ${titles.length} picks to maybe`;
    showToast(message, {
      actionLabel: "Undo",
      onAction: async () => {
        for (const k of replacedKeys) await setPlanState(k, "pick"); // conflict logic demotes the new pick
        window.dispatchEvent(new Event("setlist:rerender"));
      },
    });
  }
}

// Fetch + activate a schedule. No rendering — callers decide what to show.
export async function loadScheduleFromUrl(url) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" }); // reloads must see upstream changes
  } catch {
    return {
      ok: false,
      error: `Could not fetch ${url}. The host may block browser requests (CORS), or you are offline. You can import the file instead.`,
    };
  }
  if (!res.ok) return { ok: false, error: `Could not load ${url}: HTTP ${res.status}.` };
  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `${url} is not valid JSON.` };
  }
  try {
    await activate(json, { url });
  } catch (e) {
    return { ok: false, error: `${url}: ${e.message}` };
  }
  return { ok: true };
}
