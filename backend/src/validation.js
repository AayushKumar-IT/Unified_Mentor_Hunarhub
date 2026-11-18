export function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isValidReviewInput({ orderId, serviceRequestId, rating, reviewText }) {
  const exactlyOneTransaction = Boolean(orderId) !== Boolean(serviceRequestId);
  return exactlyOneTransaction &&
    (!orderId || isUuid(orderId)) &&
    (!serviceRequestId || isUuid(serviceRequestId)) &&
    Number.isInteger(rating) && rating >= 1 && rating <= 5 &&
    typeof reviewText === "string" && reviewText.trim().length <= 1000;
}

export function isLocalImageUrl(value) {
  return value === null || value === undefined || (
    typeof value === "string" &&
    /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(value)
  );
}
