// Screenshot a page after its JS has rendered, via headless Edge + CDP.
// Node 22+ (global fetch + WebSocket), no dependencies.
//   node tools/screenshot.mjs <url> <out.png> [--wait ms] [--size WxH]
//     [--dark] [--init file.js] [--hash "#/route"]
// --init evaluates the file's JS in the page (awaited) after the first wait —
// use it to seed state (IndexedDB/localStorage). Don't reload from inside it.
// --init/--hash trigger a second navigation without the ?url= param (the app
// then restores the stored schedule and honors the #hash route).
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const pos = [];
const opt = { wait: "3000", size: "412x915", dark: false, init: "", hash: "" };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dark") opt.dark = true;
  else if (args[i] === "--wait" || args[i] === "--size" || args[i] === "--init" || args[i] === "--hash")
    opt[args[i].slice(2)] = args[++i];
  else pos.push(args[i]);
}
const [url, out] = pos;
if (!url || !out) {
  console.error(
    'usage: node tools/screenshot.mjs <url> <out.png> [--wait ms] [--size WxH] [--dark] [--init file.js] [--hash "#/route"]',
  );
  process.exit(1);
}
const [w, h] = opt.size.split("x").map(Number);
const EDGE =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9222 + Math.floor(Math.random() * 1000);
const profile = await mkdtemp(join(tmpdir(), "edge-cdp-"));

const edge = spawn(EDGE, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${w},${h}`,
  "about:blank",
]);

const die = async (msg) => {
  console.error(msg);
  edge.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(1);
};

// wait for the debugger endpoint, then grab the first page target
let target;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 200));
}
if (!target) await die("Edge debugger endpoint never came up");

const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true });
  if (res.exceptionDetails) await die(`page script failed: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ""}`);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: w, height: h, deviceScaleFactor: 2, mobile: true,
});
if (opt.dark) {
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
}
await send("Page.navigate", { url });
await sleep(Number(opt.wait)); // let the app render (and store what ?url= loads)
if (opt.init) await evaluate(await readFile(opt.init, "utf8"));
if (opt.init || opt.hash) {
  // restart on stored state: without ?url= the app restores from IndexedDB
  // and leaves the #hash route alone (a ?url= load always resets to #/)
  const u = new URL(url);
  u.searchParams.delete("url");
  u.searchParams.set("r", Date.now()); // the app strips ?url= after loading, so
  // without this the second URL differs only by #hash — a same-document
  // navigation that Page.navigate turns into a no-op instead of a reload
  u.hash = opt.hash || "#/";
  await send("Page.navigate", { url: u.href });
  await sleep(Number(opt.wait));
}
const shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile(out, Buffer.from(shot.data, "base64"));
console.log(`wrote ${out}`);
ws.close();
edge.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});
