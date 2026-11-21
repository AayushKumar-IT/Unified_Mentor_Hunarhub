import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("marketplace product ordering has a unique tie-breaker for stable featured images", () => {
  assert.match(
    app,
    /ORDER BY pr\.featured DESC,\s*pr\.created_at DESC,\s*pr\.id ASC/
  );
});
