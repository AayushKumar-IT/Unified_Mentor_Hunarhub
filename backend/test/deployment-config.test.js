import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const vercelConfig = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")
);

test("Vercel forwards marketplace API and uploaded media requests to Render", () => {
  assert.ok(vercelConfig.rewrites.some((rewrite) =>
    rewrite.source === "/api/:path*" &&
    rewrite.destination === "https://hunarhub-backend-7f92.onrender.com/api/:path*"
  ));
  assert.ok(vercelConfig.rewrites.some((rewrite) =>
    rewrite.source === "/media/:path*" &&
    rewrite.destination === "https://hunarhub-backend-7f92.onrender.com/media/:path*"
  ));
});
