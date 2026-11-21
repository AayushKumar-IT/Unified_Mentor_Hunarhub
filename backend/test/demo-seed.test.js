import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seed = readFileSync(new URL("../sql/seed.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../sql/schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../sql/migrations/006_hide_demo_profiles.sql", import.meta.url), "utf8");
const imageMigration = readFileSync(new URL("../sql/migrations/007_entrepreneur_profile_image.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/routes/management.js", import.meta.url), "utf8");

test("runtime, fresh schema, and catalog seed do not depend on the legacy demo column", () => {
  for (const source of [app, management, seed, schema]) {
    assert.doesNotMatch(source, /is_demo|isDemo/);
  }
  assert.doesNotMatch(seed, /INSERT INTO entrepreneur_profiles|INSERT INTO services|demo-makers/i);
});

test("legacy demo cleanup remains transactional for databases upgrading from older versions", () => {
  assert.match(migration, /UPDATE services[\s\S]*?WHERE entrepreneur_id IN \([\s\S]*?WHERE is_demo = TRUE/);
  assert.match(migration, /UPDATE products[\s\S]*?WHERE entrepreneur_id IN \([\s\S]*?WHERE is_demo = TRUE/);
  assert.match(migration, /UPDATE entrepreneur_profiles[\s\S]*?WHERE is_demo = TRUE/);
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("entrepreneur image migration safely adds the column used by marketplace profile queries", () => {
  assert.match(imageMigration, /ALTER TABLE entrepreneur_profiles/i);
  assert.match(imageMigration, /ADD COLUMN IF NOT EXISTS image_url TEXT/i);
  assert.doesNotMatch(imageMigration, /\b(DROP|DELETE|TRUNCATE)\b/i);
  assert.match(app, /p\.image_url AS "imageUrl"/);
});
