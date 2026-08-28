import { renderBrowse } from "./views/browse.js";
import { renderEvent } from "./views/event.js";
import { renderGlance } from "./views/glance.js";
import { renderSlot } from "./views/slot.js";
import { esc } from "./html.js";
import { state, activate, restoreLast } from "./store.js";
import { setNowOverride } from "./clock.js";

const app = document.getElementById("app");

async function loadSchedule(url) {
  app.innerHTML = `<p class="status pad">Loading…</p>`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    renderLoadScreen(
      `Could not fetch ${url}. The host may block browser requests (CORS), or you are offline. You can import the file instead.`,
    );
    return;
  }
  if (!res.ok) {
    renderLoadScreen(`Could not load ${url}: HTTP ${res.status}.`);
    return;
  }
  let json;
  try {
    json = await res.json();
  } catch {
    renderLoadScreen(`${url} is not valid JSON.`);
    return;
  }
  try {
    await activate(json, { url });
  } catch (e) {
    renderLoadScreen(`${url}: ${e.message}`);
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
  if (!state.model) {
    renderLoadScreen();
    return;
  }
  const hash = location.hash || "#/";
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
}

// The ONLY interval in the app: refresh the glance while it is on screen.
setInterval(() => {
  const h = location.hash;
  if (state.model && (h === "" || h === "#/")) route();
}, 30000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.model) route();
});

const startUrl = new URLSearchParams(location.search).get("url");
if (startUrl) {
  loadSchedule(startUrl);
} else {
  app.innerHTML = `<p class="status pad">Loading…</p>`;
  restoreLast().then(route, () => route());
}
