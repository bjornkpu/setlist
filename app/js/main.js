import { renderBrowse } from "./views/browse.js";
import { renderEvent } from "./views/event.js";
import { esc } from "./html.js";
import { state, activate, restoreLast } from "./store.js";

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
  location.hash = "#/browse"; // phase 4: glance claims #/
  route();
  // strip ?url= after a successful load so reload/share links stay clean
  if (new URLSearchParams(location.search).has("url")) {
    history.replaceState(null, "", location.pathname + location.hash);
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
      location.hash = "#/browse"; // phase 4: glance claims #/
      route();
    } catch (err) {
      renderLoadScreen(`Import failed: ${err.message}`);
    }
  });
}

function route() {
  if (!state.model) {
    renderLoadScreen();
    return;
  }
  const hash = location.hash || "#/browse";
  const evMatch = hash.match(/^#\/event\/(.+)$/);
  if (evMatch) {
    let key;
    try {
      key = decodeURIComponent(evMatch[1]);
    } catch {
      key = evMatch[1]; // malformed encoding: use raw, falls through to "Session not found"
    }
    renderEvent(app, state, key);
  } else {
    renderBrowse(app, state); // #/browse and, for now, everything else
  }
}

window.addEventListener("hashchange", route);

const startUrl = new URLSearchParams(location.search).get("url");
if (startUrl) {
  loadSchedule(startUrl);
} else {
  restoreLast().then(route);
}
