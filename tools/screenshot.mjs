// Screenshot a page after its JS has rendered, via headless Edge + CDP.
// Node 22+ (global fetch + WebSocket), no dependencies.
//   node tools/screenshot.mjs <url> <out.png> [waitMs] [WxH]
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, waitMs = "3000", size = "412x915"] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node tools/screenshot.mjs <url> <out.png> [waitMs] [WxH]");
  process.exit(1);
}
const [w, h] = size.split("x").map(Number);
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: w, height: h, deviceScaleFactor: 2, mobile: true,
});
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, Number(waitMs))); // let the app render
const shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile(out, Buffer.from(shot.data, "base64"));
console.log(`wrote ${out}`);
ws.close();
edge.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});
