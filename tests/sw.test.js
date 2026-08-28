import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appDir = new URL("../app/", import.meta.url);

test("sw precache list matches the app shell on disk", async () => {
  const sw = await readFile(new URL("sw.js", appDir), "utf8");
  const block = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const entries = [...block.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]);
  assert.ok(entries.includes(""), 'SHELL must contain "./" (the navigation root)');
  const shell = entries.filter(Boolean).sort();
  const disk = (await readdir(fileURLToPath(appDir), { recursive: true }))
    .map((f) => String(f).replaceAll("\\", "/"))
    .filter((f) => /\.(js|css|html|json|svg)$/.test(f) && f !== "sw.js")
    .sort();
  assert.deepEqual(shell, disk); // both directions: nothing missing, nothing phantom
});
