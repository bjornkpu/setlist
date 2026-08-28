// The app's single source of time. ?at=<ISO> freezes it for QA.

let override = null;

export function setNowOverride(ms) {
  override = ms;
}

export function now() {
  return override ?? Date.now();
}
