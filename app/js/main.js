import { normalize } from "./schedule.js";
import { renderBrowse } from "./views/browse.js";
import { renderEvent } from "./views/event.js";
import { esc } from "./html.js";

const app = document.getElementById("app");

export const state = {
  model: null,
  sourceUrl: "",
  browse: { dayIndex: 0, room: "", track: "", q: "" },
};

function defaultDayIndex(model) {
  const today = new Date().toLocaleDateString("sv-SE"); // sv-SE = YYYY-MM-DD, local time
  const i = model.days.findIndex((d) => d.date === today);
  return i === -1 ? 0 : i;
}

function activate(model, sourceUrl) {
  state.model = model;
  state.sourceUrl = sourceUrl;
  state.browse = { dayIndex: defaultDayIndex(model), room: "", track: "", q: "" };
  location.hash = "#/browse";
  route();
}

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
    activate(normalize(json), url);
  } catch (e) {
    renderLoadScreen(`${url}: ${e.message}`);
    return;
  }
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
      activate(normalize(JSON.parse(await file.text())), file.name);
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
    renderEvent(app, state, decodeURIComponent(evMatch[1]));
  } else {
    renderBrowse(app, state); // #/browse and, for now, everything else
  }
}

window.addEventListener("hashchange", route);

const startUrl = new URLSearchParams(location.search).get("url");
if (startUrl) {
  loadSchedule(startUrl);
} else {
  route();
}
