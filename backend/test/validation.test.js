import test from "node:test";
import assert from "node:assert/strict";
import { isUuid, isValidReviewInput, isLocalImageUrl } from "../src/validation.js";

test("UUID validation accepts canonical UUIDs", () => {
  assert.equal(isUuid("10000000-0000-4000-8000-000000000001"), true);
});

test("UUID validation rejects malformed values", () => {
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("10000000-0000-4000-8000-00000000000z"), false);
  assert.equal(isUuid("10000000-0000-0000-0000-000000000001"), false);
});

test("review validation requires one transaction and a valid rating", () => {
  const orderId = "10000000-0000-4000-8000-000000000001";
  assert.equal(isValidReviewInput({
    orderId,
    rating: 5,
    reviewText: "Excellent work"
  }), true);
  assert.equal(isValidReviewInput({
    orderId,
    serviceRequestId: "10000000-0000-4000-8000-000000000002",
    rating: 5,
    reviewText: ""
  }), false);
  assert.equal(isValidReviewInput({
    serviceRequestId: "invalid",
    rating: 5,
    reviewText: ""
  }), false);
  assert.equal(isValidReviewInput({
    orderId,
    rating: 6,
    reviewText: ""
  }), false);
});

test("product images must use generated local image paths", () => {
  assert.equal(isLocalImageUrl(null), true);
  assert.equal(isLocalImageUrl("/media/10000000-0000-4000-8000-000000000001.webp"), true);
  assert.equal(isLocalImageUrl("https://example.com/image.jpg"), false);
  assert.equal(isLocalImageUrl("/media/../../package.json"), false);
  assert.equal(isLocalImageUrl("/media/10000000-0000-4000-8000-000000000001.svg"), false);
});
