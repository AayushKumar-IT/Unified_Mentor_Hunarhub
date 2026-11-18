import { useEffect, useState } from "react";
import { apiRequest } from "../api.js";

function localDateTimeMinimum() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

export default function DetailsDialog({ selection, onClose, onRequestService, onOrderProduct, onViewProduct }) {
  const [details, setDetails] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selection) return undefined;
    let active = true;
    setDetails(null);
    setReviews([]);
    setError("");
    setQuantity(1);
    const endpoint = selection.type === "maker"
      ? `/api/entrepreneurs/${selection.id}`
      : `/api/products/${selection.id}`;
    apiRequest(endpoint)
      .then(async (result) => {
        if (!active) return;
        setDetails(result);
        if (selection.type === "maker") {
          const reviewResult = await apiRequest(`/api/entrepreneurs/${selection.id}/reviews`);
          if (active) setReviews(reviewResult.reviews);
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, [selection]);

  if (!selection) return null;

  async function submitService(event, serviceId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requestedFor = form.get("requestedFor");
    setSubmitting(true);
    setError("");
    try {
      await onRequestService({
        serviceId,
        requestedFor: requestedFor ? new Date(requestedFor).toISOString() : null,
        message: form.get("message") || ""
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOrder() {
    setSubmitting(true);
    setError("");
    try {
      await onOrderProduct(details.id, quantity);
    } catch (orderError) {
      setError(orderError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-backdrop details-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-title">
        <button className="auth-close" type="button" aria-label="Close details" onClick={onClose}>×</button>
        {!details && !error && <div className="loading-state">Loading details…</div>}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {details && selection.type === "maker" && (
          <>
            <div className="eyebrow">{details.category} · VERIFIED LOCAL MAKER</div>
            <h2 id="details-title" className="details-title">{details.displayName}</h2>
            <p className="details-meta">{details.location} · {details.experienceYears} years of experience</p>
            <p className="details-description">{details.bio || "A local entrepreneur sharing their craft with the community."}</p>
            {details.skills.length > 0 && (
              <div className="maker-skills details-skills">
                {details.skills.map((skill) => <span key={skill.id}>{skill.name}</span>)}
              </div>
            )}
            <div className="details-rating">★ {details.rating ? details.rating.toFixed(1) : "New"} {details.reviewCount ? `· ${details.reviewCount} reviews` : "· No reviews yet"}</div>
            <h3 className="details-section-title">Services</h3>
            {details.services.length ? details.services.map((service) => (
              <form className="details-offering" key={service.id} onSubmit={(event) => submitService(event, service.id)}>
                <div className="details-offering-heading">
                  <div><strong>{service.title}</strong><p>{service.description}</p></div>
                  <b>₹{Math.round(service.price)}</b>
                </div>
                {details.availability === "available" ? (
                  <>
                    <label className="details-label">
                      Preferred date and time (optional)
                      <input className="form-control form-control-sm" name="requestedFor" type="datetime-local" min={localDateTimeMinimum()} />
                    </label>
                    <label className="details-label">
                      Message (optional)
                      <textarea className="form-control form-control-sm" name="message" rows={2} maxLength={1000} placeholder="Share details about the service you need" />
                    </label>
                    <button className="btn btn-dark btn-sm rounded-pill" disabled={submitting}>Request this service</button>
                  </>
                ) : <span className="status-badge status-unavailable">Not taking requests right now</span>}
              </form>
            )) : <p className="dashboard-empty">No active services listed.</p>}
            <h3 className="details-section-title">Handmade products</h3>
            {details.products.length ? (
              <div className="details-maker-products">
                {details.products.map((product) => (
                  <button
                    className="details-maker-product"
                    key={product.id}
                    type="button"
                    onClick={() => onViewProduct(product.id)}
                  >
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt="" />
                      : <span className="details-maker-product-placeholder" aria-hidden="true">✳</span>}
                    <span><strong>{product.title}</strong><small>₹{Math.round(product.price)} · {product.stock} available</small></span>
                  </button>
                ))}
              </div>
            ) : <p className="dashboard-empty">No products currently listed.</p>}
            <h3 className="details-section-title">Customer reviews</h3>
            {reviews.length ? reviews.map((review) => (
              <article className="details-review" key={review.id}>
                <div><strong>{review.customerName || "HunarHub customer"}</strong><span>★ {review.rating}</span></div>
                {review.reviewText && <p>{review.reviewText}</p>}
                <small>{new Date(review.createdAt).toLocaleDateString()}</small>
              </article>
            )) : <p className="dashboard-empty">No customer reviews yet.</p>}
          </>
        )}
        {details && selection.type === "product" && (
          <>
            {details.imageUrl ? (
              <img className="details-product-image" src={details.imageUrl} alt={details.title} />
            ) : (
              <div className="details-product-placeholder" aria-hidden="true">✳</div>
            )}
            <div className="eyebrow">{details.category} · HANDMADE</div>
            <h2 id="details-title" className="details-title">{details.title}</h2>
            <p className="details-meta">Made by {details.sellerName} · {details.location}</p>
            <p className="details-description">{details.description}</p>
            <div className="details-product-purchase">
              <strong>₹{Math.round(details.price)}</strong>
              <span>{details.stock} available</span>
            </div>
            <label className="details-label">
              Quantity
              <input
                className="form-control form-control-sm"
                type="number"
                min="1"
                max={Math.min(20, details.stock)}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Math.min(Number(event.target.value) || 1, details.stock, 20)))}
              />
            </label>
            <button className="btn btn-dark rounded-pill w-100" disabled={submitting} onClick={submitOrder}>
              {submitting ? "Sending request…" : "Request to buy"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
