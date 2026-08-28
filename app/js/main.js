import { renderBrowse } from "./views/browse.js";
import { renderEvent } from "./views/event.js";
import { renderGlance } from "./views/glance.js";
import { renderSlot } from "./views/slot.js";
import { renderLibrary } from "./views/library.js";
import { esc } from "./html.js";
import { state, activate, restoreLast } from "./store.js";
import { loadScheduleFromUrl } from "./actions.js";
import { setNowOverride } from "./clock.js";
import { showToast } from "./toast.js";

const app = document.getElementById("app");

async function failLoad(message) {
  if (await restoreLast()) {
    route(); // fall back to the cached schedule…
    showToast(message); // …and surface the failure without blocking it
  } else {
    renderLoadScreen(message);
  }
}

async function loadSchedule(url) {
  app.innerHTML = `<p class="status pad">Loading…</p>`;
  const result = await loadScheduleFromUrl(url);
  if (!result.ok) {
    await failLoad(result.error);
    return;
  }
  location.hash = "#/";
  route();
  // strip only ?url= after a successful load; other params (e.g. ?at=) stay
  const params = new URLSearchParams(location.search);
  if (params.has("url")) {
    params.delete("url");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
}

function renderLoadScreen(error = "") {
  app.innerHTML = `
    <div class="pad">
      <h1>setlist</h1>
      ${error ? `<p class="error">${esc(error)}</p>` : ""}
      <form id="load-form">
        <label for="load-url">Load a schedule by URL</label>
        <input id="load-url" name="url" type="url" placeholder="https://…/schedule.json" required>
        <button type="submit">Load</button>
      </form>
      <p class="or"><label>…or import a schedule.json file
        <input type="file" id="file-import" accept=".json,application/json">
      </label></p>
      <p><a href="#/library">Library &amp; providers</a></p>
    </div>`;
  document.getElementById("load-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadSchedule(new FormData(e.target).get("url"));
  });
  document.getElementById("file-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await activate(JSON.parse(await file.text()), { fromFile: true, label: file.name });
    } catch (err) {
      renderLoadScreen(`Import failed: ${err.message}`);
      return;
    }
    location.hash = "#/";
    route();
  });
}

function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/library")) {
    renderLibrary(app, state).catch(console.error);
    return;
  }
  if (!state.model) {
    renderLoadScreen();
    return;
  }
  const decode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s; // malformed encoding: use raw, falls through to "not found"
    }
  };
  const evMatch = hash.match(/^#\/event\/(.+)$/);
  const slotMatch = hash.match(/^#\/slot\/(.+)$/);
  if (evMatch) {
    renderEvent(app, state, decode(evMatch[1]));
  } else if (slotMatch) {
    renderSlot(app, state, decode(slotMatch[1]));
  } else if (hash.startsWith("#/browse")) {
    renderBrowse(app, state);
  } else {
    renderGlance(app, state); // #/ and anything unrecognized
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("setlist:rerender", route);

const atParam = new URLSearchParams(location.search).get("at");
if (atParam) {
  const ms = Date.parse(atParam);
  if (!Number.isNaN(ms)) setNowOverride(ms); // QA: freeze the clock; param is kept in the URL
  else console.warn("?at= not parseable:", atParam);
}

const onGlance = () => Boolean(state.model) && (location.hash === "" || location.hash === "#/");

// The ONLY interval in the app: refresh the glance while it is on screen.
setInterval(() => {
  if (onGlance()) route();
}, 30000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && onGlance()) route();
});

const startUrl = new URLSearchParams(location.search).get("url");
if (startUrl) {
  loadSchedule(startUrl);
} else {
  app.innerHTML = `<p class="status pad">Loading…</p>`;
  restoreLast().then(route, () => route());
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW registration failed", e));
  // no SW available (plain http, private mode): the app still works online
}
