import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/passwords.js";

test("password hash verifies only the original password", async () => {
  const password = "correct horse battery staple";
  const hash = await hashPassword(password);

  assert.match(hash, /^scrypt\$[a-f\d]{32}\$[a-f\d]{128}$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("incorrect password", hash), false);
});

test("password verifier rejects malformed hashes", async () => {
  assert.equal(await verifyPassword("password", "not-a-hash"), false);
  assert.equal(await verifyPassword("password", "scrypt$xyz$1234"), false);
});
