// localStorage wrapper. Storage can throw (private mode, blocked) — degrade silently.

export function getSetting(name) {
  try {
    return localStorage.getItem("setlist:" + name) ?? "";
  } catch {
    return "";
  }
}

export function setSetting(name, value) {
  try {
    localStorage.setItem("setlist:" + name, value);
  } catch {
    // best effort; app runs in-memory without settings
  }
}
