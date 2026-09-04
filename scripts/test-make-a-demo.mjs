import assert from "node:assert/strict";
import { PAGES, pageFromHash } from "../make-a-demo/app.js";

assert.equal(PAGES.length, 5);
assert.deepEqual(
  PAGES.map((page) => page.id),
  ["overview", "features", "pricing", "about", "contact"]
);
assert.equal(pageFromHash("").id, "overview");
assert.equal(pageFromHash("#features").id, "features");
assert.equal(pageFromHash("pricing").id, "pricing");
assert.equal(pageFromHash("#nope").id, "overview");
assert.equal(pageFromHash("#contact").label, "Contact");

console.log("make-a-demo page option tests passed");
