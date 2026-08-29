import { esc } from "../html.js";
import {
  state,
  activateRecord,
  removeSchedule,
  listProviders,
  addProvider,
  removeProvider,
  rememberProviderName,
  DEFAULT_PROVIDER,
} from "../store.js";
import { dbGetAll } from "../db.js";
import { fetchIndex, splitByDate } from "../providers.js";
import { loadScheduleFromUrl } from "../actions.js";
import { showToast } from "../toast.js";
import { now } from "../clock.js";
import { header } from "./header.js";

export async function renderLibrary(app) {
  app.innerHTML = `<p class="status pad">Loading library…</p>`;
  let schedules = [];
  try {
    schedules = await dbGetAll("schedules");
  } catch {
    // storage unavailable: library still shows providers and load-by-URL
  }
  schedules.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const providers = await listProviders();
  if (!location.hash.startsWith("#/library")) return; // user navigated away mid-await
  app.innerHTML = `
    <div class="library">
      ${header("Library", "library")}
      <h2>Schedules</h2>
      <ul class="cards">
        ${schedules.map(scheduleRow).join("") || `<li class="status">No schedules loaded yet.</li>`}
      </ul>
      <h2>Providers</h2>
      <ul class="cards">
        ${providers.map(providerRow).join("") || `<li class="status">No providers.</li>`}
      </ul>
      <form id="add-provider" class="row-form">
        <input type="url" name="url" placeholder="Provider URL" required aria-label="Provider URL">
        <button type="submit">Add provider</button>
      </form>
      <form id="load-url" class="row-form">
        <input type="url" name="url" placeholder="https://…/schedule.json" required aria-label="Schedule URL">
        <button type="submit">Load schedule</button>
      </form>
    </div>`;
  wire(app);
}

function scheduleRow(r) {
  const active = r.key === state.scheduleKey;
  const dates = `${esc(r.start)}${r.end && r.end !== r.start ? `–${esc(r.end)}` : ""}`;
  return `<li class="${active ? "active" : ""}" data-key="${esc(r.key)}">
    <div class="card-main">
      <span class="title">${esc(r.title || r.key)}</span>
      <span class="meta">${dates}${active ? " · active" : ""}</span>
    </div>
    <div class="card-actions">
      <button data-action="open">Open</button>
      ${r.url ? `<button data-action="reload">Reload</button>` : ""}
      <button data-action="remove">Remove</button>
    </div>
  </li>`;
}

function providerRow(p) {
  return `<li data-provider="${esc(p.key)}">
    <div class="card-main">
      <span class="title">${esc(p.name || p.url)}</span>
      <span class="meta">${esc(p.url)}</span>
    </div>
    <div class="card-actions">
      <button data-action="browse">Browse</button>
      <button data-action="remove-provider">Remove</button>
    </div>
    <div class="provider-schedules"></div>
  </li>`;
}

function wire(app) {
  const rerender = () => renderLibrary(app).catch(console.error);
  app.querySelector(".library").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    try {
      await handleAction(btn, rerender);
    } catch (err) {
      showToast(String(err?.message ?? err));
    }
  });
  app.querySelector("#add-provider").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addProvider(new FormData(e.target).get("url").trim());
    rerender();
  });
  app.querySelector("#load-url").addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = await loadScheduleFromUrl(new FormData(e.target).get("url").trim());
    if (result.ok) location.hash = "#/";
    else showToast(result.error);
  });
}

async function handleAction(btn, rerender) {
  const action = btn.dataset.action;
  if (action === "load-schedule") {
    btn.disabled = true;
    const result = await loadScheduleFromUrl(btn.dataset.url);
    if (result.ok) location.hash = "#/";
    else {
      btn.disabled = false;
      showToast(result.error);
    }
    return;
  }
  if (action === "browse") {
    await browseProvider(btn.closest("li[data-provider]"));
    return;
  }
  if (action === "remove-provider") {
    const li = btn.closest("li[data-provider]");
    const provider = (await listProviders()).find((p) => p.key === li.dataset.provider);
    if (provider && confirm(`Remove provider "${provider.name || provider.url}"? Cached schedules stay.`)) {
      await removeProvider(provider);
      rerender();
    }
    return;
  }
  const key = btn.closest("li[data-key]")?.dataset.key;
  const record = (await dbGetAll("schedules")).find((r) => r.key === key);
  if (!record) return;
  if (action === "open") {
    await activateRecord(record);
    location.hash = "#/";
  } else if (action === "reload") {
    btn.disabled = true;
    const result = await loadScheduleFromUrl(record.url);
    showToast(result.ok ? "Schedule reloaded — plan kept." : result.error);
    rerender();
  } else if (action === "remove") {
    if (confirm(`Remove "${record.title || key}" and its plan? This cannot be undone.`)) {
      await removeSchedule(key);
      rerender();
    }
  }
}

async function browseProvider(li) {
  const box = li.querySelector(".provider-schedules");
  box.innerHTML = `<p class="status">Loading…</p>`;
  let index;
  try {
    index = await fetchIndex(li.dataset.provider);
  } catch (err) {
    box.innerHTML = `<p class="error">Could not load provider index: ${esc(err.message)}. The host may block browser requests (CORS) or you are offline.</p>`;
    return;
  }
  if (index.name && li.dataset.provider !== DEFAULT_PROVIDER) {
    const title = li.querySelector(".card-main .title");
    if (title) title.textContent = index.name;
    rememberProviderName(li.dataset.provider, index.name).catch(console.error);
  }
  const today = new Date(now()).toLocaleDateString("sv-SE");
  const { upcoming, past } = splitByDate(index.schedules, today);
  const item = (s) => `<li>
      <span class="title">${esc(s.title)}</span>
      <span class="meta">${esc(s.start)}${s.end && s.end !== s.start ? `–${esc(s.end)}` : ""}</span>
      <button data-action="load-schedule" data-url="${esc(s.url)}">Load</button>
    </li>`;
  box.innerHTML = `
    ${upcoming.length
      ? `<h3>Upcoming</h3><ul class="provider-list">${upcoming.map(item).join("")}</ul>`
      : `<p class="status">No upcoming events.</p>`}
    ${past.length
      ? `<details><summary>Past (${past.length})</summary><ul class="provider-list">${past.map(item).join("")}</ul></details>`
      : ""}`;
}
