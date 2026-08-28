// UI-facing actions shared by views. Terms: CONTEXT.md.
import { setPlanState, allEvents } from "./store.js";
import { showToast } from "./toast.js";

// Apply a state change; `rerender` refreshes the originating view in place
// (kept as a callback so browse can do a list-only refresh that preserves
// search focus and scroll). A replaced pick gets an Undo toast; undo
// re-renders whatever view is current via the global event.
export async function applyState(eventKey, newState, rerender) {
  const replacedKeys = await setPlanState(eventKey, newState);
  rerender();
  if (replacedKeys.length) {
    const titles = replacedKeys
      .map((k) => allEvents().find((e) => e.key === k)?.title ?? "session");
    const message = titles.length === 1
      ? `Replaced pick: ${titles[0]}`
      : `Replaced ${titles.length} picks`;
    showToast(message, {
      actionLabel: "Undo",
      onAction: async () => {
        for (const k of replacedKeys) await setPlanState(k, "pick"); // conflict logic clears the new pick
        window.dispatchEvent(new Event("setlist:rerender"));
      },
    });
  }
}
