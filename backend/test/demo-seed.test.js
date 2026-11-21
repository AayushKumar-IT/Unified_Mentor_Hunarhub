import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seed = readFileSync(new URL("../sql/seed.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../sql/migrations/006_hide_demo_profiles.sql", import.meta.url), "utf8");

test("catalog seed no longer creates demo entrepreneur profiles or services", () => {
  assert.doesNotMatch(seed, /INSERT INTO entrepreneur_profiles/i);
  assert.doesNotMatch(seed, /INSERT INTO services/i);
  assert.doesNotMatch(seed, /demo-makers/i);
});

test("demo cleanup deactivates demo profiles, services, and products only", () => {
  for (const sql of [seed, migration]) {
    assert.match(sql, /UPDATE services[\s\S]*?WHERE entrepreneur_id IN \([\s\S]*?WHERE is_demo = TRUE/);
    assert.match(sql, /UPDATE products[\s\S]*?WHERE entrepreneur_id IN \([\s\S]*?WHERE is_demo = TRUE/);
    assert.match(sql, /UPDATE entrepreneur_profiles[\s\S]*?WHERE is_demo = TRUE/);
  }
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
});
