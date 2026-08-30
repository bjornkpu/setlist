import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ICON } from "../app/js/icons.js";

// The inline icons in app/js/icons.js duplicate the svg files in
// app/assets/icons/ (inline is needed for currentColor strokes). This guard
// keeps the two from drifting: edit the file, then paste the same body here.
const inner = (svg) =>
  svg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/\s+/g, " ")
    .replaceAll("> <", "><")
    .trim();

test("inline ICON entries match the svg files in app/assets/icons", async () => {
  for (const [name, markup] of Object.entries(ICON)) {
    const file = await readFile(new URL(`../app/assets/icons/${name}.svg`, import.meta.url), "utf8");
    assert.equal(inner(markup), inner(file), `${name}: app/js/icons.js drifted from ${name}.svg`);
  }
});
