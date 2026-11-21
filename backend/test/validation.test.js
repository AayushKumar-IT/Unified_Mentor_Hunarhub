import test from "node:test";
import assert from "node:assert/strict";
import { isUuid, isValidReviewInput, isValidProductImageUrl } from "../src/validation.js";

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

test("product images accept generated local paths and the HunarHub Cloudinary folder only", () => {
  assert.equal(isValidProductImageUrl(null), true);
  assert.equal(isValidProductImageUrl("/media/10000000-0000-4000-8000-000000000001.webp"), true);
  assert.equal(isValidProductImageUrl(
    "https://res.cloudinary.com/hunarhub/image/upload/v1234567890/hunarhub/entrepreneur-images/10000000-0000-4000-8000-000000000001.jpg"
  ), true);
  assert.equal(isValidProductImageUrl(
    "https://res.cloudinary.com/hunarhub/image/upload/v1234567890/hunarhub/entrepreneur-images/10000000-0000-4000-8000-000000000001"
  ), true);
  assert.equal(isValidProductImageUrl("https://example.com/image.jpg"), false);
  assert.equal(isValidProductImageUrl("https://res.cloudinary.com.evil.example/image.jpg"), false);
  assert.equal(isValidProductImageUrl("http://res.cloudinary.com/hunarhub/image/upload/image.jpg"), false);
  assert.equal(isValidProductImageUrl(
    "https://res.cloudinary.com/hunarhub/image/upload/v1234567890/other-folder/10000000-0000-4000-8000-000000000001.jpg"
  ), false);
  assert.equal(isValidProductImageUrl("/media/../../package.json"), false);
  assert.equal(isValidProductImageUrl("/media/10000000-0000-4000-8000-000000000001.svg"), false);
});
