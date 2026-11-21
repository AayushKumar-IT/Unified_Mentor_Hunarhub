import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api.js";

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status.replaceAll("_", " ")}</span>;
}

function DashboardToast({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="dashboard-toast" role="status" aria-live="polite">
      <span className="dashboard-toast-icon" aria-hidden="true">✓</span>
      <span>{message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>×</button>
    </div>
  );
}

function DashboardHeading({ eyebrow, title, description, user }) {
  const displayName = user?.displayName?.trim() || "HunarHub member";
  const initial = Array.from(displayName)[0]?.toLocaleUpperCase() ?? "H";

  return (
    <header className="workspace-heading">
      <div className="workspace-heading-copy">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="workspace-account">
        <span className="workspace-avatar" aria-hidden="true">{initial}</span>
        <span className="workspace-account-copy">
          <strong>{displayName}</strong>
          <small>{user?.role === "admin" ? "Administrator" : user?.role === "entrepreneur" ? "Entrepreneur account" : "Customer account"}</small>
        </span>
      </div>
    </header>
  );
}

function EntrepreneurDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState({ services: [], products: [] });
  const [transactions, setTransactions] = useState({ requests: [], orders: [] });
  const [earnings, setEarnings] = useState(null);
  const [skillOptions, setSkillOptions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dismissToast = useCallback(() => setMessage(""), []);

  function navigateToSection(sectionId) {
    const section = document.getElementById(sectionId);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    section?.focus({ preventScroll: true });
  }

  async function loadDashboard() {
    const [profileData, listingData, transactionData, earningsData, categoryData] = await Promise.all([
      apiRequest("/api/entrepreneur/profile"),
      apiRequest("/api/entrepreneur/listings"),
      apiRequest("/api/entrepreneur/transactions"),
      apiRequest("/api/entrepreneur/earnings"),
      apiRequest("/api/categories")
    ]);
    setProfile(profileData);
    setListings(listingData);
    setTransactions(transactionData);
    setEarnings(earningsData);
    setCategories(categoryData);
    setSelectedSkills(profileData.skills.map((skill) => skill.id));
    const skillsData = await apiRequest(`/api/skills?category=${encodeURIComponent(profileData.categorySlug)}`);
    setSkillOptions(skillsData);
  }

  useEffect(() => {
    loadDashboard().catch((loadError) => setError(loadError.message));
  }, []);

  async function changeStatus(path, action) {
    setError("");
    setMessage("");
    try {
      await apiRequest(path, { method: "PATCH", body: JSON.stringify({ action }) });
      await loadDashboard();
      setMessage("The status was updated.");
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function addListing(event, type) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setMessage("");
    const form = new FormData(formElement);
    let imageUrl;
    const image = form.get("image");
    try {
      if (type === "products" && image instanceof File && image.size > 0) {
        const upload = new FormData();
        upload.append("image", image);
        const uploaded = await apiRequest("/api/entrepreneur/images", {
          method: "POST",
          body: upload
        });
        imageUrl = uploaded.imageUrl;
      }
    } catch (uploadError) {
      setError(uploadError.message);
      return;
    }
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      price: Number(form.get("price")),
      ...(type === "products" ? {
        stock: Number(form.get("stock")),
        ...(imageUrl ? { imageUrl } : {})
      } : {})
    };
    try {
      await apiRequest(`/api/entrepreneur/${type}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      formElement.reset();
      await loadDashboard();
      setMessage(type === "services" ? "Service added." : "Product added.");
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/entrepreneur/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: form.get("displayName"),
          bio: form.get("bio"),
          location: form.get("location"),
          experienceYears: Number(form.get("experienceYears")),
          categorySlug: form.get("categorySlug")
        })
      });
      await loadDashboard();
      setMessage("Your profile has been saved.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function resubmitProfile() {
    setError("");
    setMessage("");
    try {
      const result = await apiRequest("/api/entrepreneur/profile/resubmit", { method: "POST" });
      setProfile({ ...profile, verificationStatus: result.verificationStatus });
      setMessage("Your updated profile has been resubmitted for verification.");
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  async function saveListing(event, item, type) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      price: Number(form.get("price")),
      active: form.get("active") === "on",
      ...(type === "products" ? { stock: Number(form.get("stock")) } : {})
    };
    try {
      if (type === "products") {
        const image = form.get("image");
        if (image instanceof File && image.size > 0) {
          const upload = new FormData();
          upload.append("image", image);
          const uploaded = await apiRequest("/api/entrepreneur/images", {
            method: "POST",
            body: upload
          });
          payload.imageUrl = uploaded.imageUrl;
        }
      }
      await apiRequest(`/api/entrepreneur/${type}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await loadDashboard();
      setMessage(`${type === "services" ? "Service" : "Product"} updated.`);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function toggleAvailability() {
    setError("");
    setMessage("");
    try {
      const availability = profile.availability === "available" ? "unavailable" : "available";
      const result = await apiRequest("/api/entrepreneur/availability", {
        method: "PATCH",
        body: JSON.stringify({ availability })
      });
      setProfile({ ...profile, availability: result.availability });
      setMessage(result.availability === "available" ? "You’re now available for requests." : "You’re now marked unavailable.");
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function saveSkills(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/entrepreneur/skills", {
        method: "PUT",
        body: JSON.stringify({ skillIds: selectedSkills })
      });
      await loadDashboard();
      setMessage("Your skills have been updated.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  if (error && !profile) return <div className="alert alert-danger">{error}</div>;
  if (!profile) return <div className="loading-state">Loading your dashboard…</div>;

  const approvalMessages = {
    pending: {
      title: "Your profile is awaiting approval",
      summary: "Your application is being reviewed. Listings will become visible to customers after approval.",
      detail: "You can keep updating your profile while the review is in progress. We’ll update this status when an administrator makes a decision."
    },
    verified: {
      title: "Your profile is approved",
      summary: "Your entrepreneur profile has been approved and can appear in the marketplace.",
      detail: "Keep your profile, services, and products up to date so customers can find and contact you."
    },
    rejected: {
      title: "Your profile needs changes before approval",
      summary: "Your application was not approved. Update your profile and submit it for review again.",
      detail: "Check that your profile information is complete and accurate before resubmitting."
    }
  };
  const approvalMessage = approvalMessages[profile.verificationStatus] ?? approvalMessages.pending;
  const approvalSummary = profile.verificationStatus === "rejected" && profile.verificationMessage
    ? `${approvalMessage.summary} Review note: ${profile.verificationMessage}`
    : approvalMessage.summary;

  return (
    <section className="dashboard-page">
      <div className={`approval-status-banner approval-${profile.verificationStatus}`} role="status">
        <strong>{approvalMessage.title}</strong>
        <span>{approvalSummary}</span>
        <a href="#profile-approval-status">View approval status</a>
      </div>
      <DashboardHeading
        eyebrow="MAKER WORKSPACE"
        title="Your dashboard"
        description="Manage your profile, showcase your work, and keep up with customer requests."
        user={user}
      />
      <div className="maker-availability-row">
        <button className="btn btn-outline-dark rounded-pill" type="button" onClick={toggleAvailability}>
          {profile.availability === "available" ? "Available for requests" : "Not taking requests"}
        </button>
      </div>
      <DashboardToast message={message} onDismiss={dismissToast} />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="dashboard-stats">
        <button className="dashboard-stat-card maker-stat-card" type="button" aria-label="View completed earnings" onClick={() => navigateToSection("maker-transactions")}>
          <span>Completed earnings</span><strong>₹{Math.round(earnings?.completedEarnings ?? 0)}</strong><small>From fulfilled work</small><span className="dashboard-stat-arrow" aria-hidden="true">↗</span>
        </button>
        <button className="dashboard-stat-card maker-stat-card" type="button" aria-label="View completed transactions" onClick={() => navigateToSection("maker-transactions")}>
          <span>Completed transactions</span><strong>{earnings?.completedTransactions ?? 0}</strong><small>Orders and service requests</small><span className="dashboard-stat-arrow" aria-hidden="true">↗</span>
        </button>
        <button className="dashboard-stat-card maker-stat-card" type="button" aria-label="Manage your services" onClick={() => navigateToSection("maker-services")}>
          <span>Your services</span><strong>{listings.services.length}</strong><small>Listed services</small><span className="dashboard-stat-arrow" aria-hidden="true">↗</span>
        </button>
        <button className="dashboard-stat-card maker-stat-card" type="button" aria-label="Manage your products" onClick={() => navigateToSection("maker-products")}>
          <span>Your products</span><strong>{listings.products.length}</strong><small>Handmade listings</small><span className="dashboard-stat-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
      <section id="profile-approval-status" className={`dashboard-card approval-status-card approval-${profile.verificationStatus}`} tabIndex="-1">
        <div className="approval-status-heading">
          <div>
            <div className="eyebrow">ACCOUNT REVIEW</div>
            <h2>Profile approval status</h2>
          </div>
          <StatusBadge status={profile.verificationStatus} />
        </div>
        <strong>{approvalMessage.title}</strong>
        <p>{approvalMessage.detail}</p>
        {profile.verificationStatus === "rejected" && profile.verificationMessage && (
          <p className="approval-review-note"><strong>Administrator’s review note:</strong> {profile.verificationMessage}</p>
        )}
        {profile.verificationStatus === "rejected" && (
          <button className="btn btn-sm btn-dark rounded-pill" onClick={resubmitProfile}>Resubmit for review</button>
        )}
      </section>
      <section id="maker-profile" className="dashboard-card dashboard-profile-card" tabIndex="-1">
        <div className="dashboard-section-heading">
          <span className="dashboard-section-icon" aria-hidden="true">✦</span>
          <div><div className="eyebrow">HOW CUSTOMERS FIND YOU</div><h2>Your public profile</h2></div>
        </div>
        <form className="dashboard-form profile-form" onSubmit={saveProfile}>
          <label>Business or display name<input className="form-control" name="displayName" required minLength={2} maxLength={100} defaultValue={profile.displayName} /></label>
          <label>About your work<textarea className="form-control" name="bio" maxLength={2000} rows={3} defaultValue={profile.bio} /></label>
          <div className="form-row">
            <label>Town or service area<input className="form-control" name="location" required minLength={2} maxLength={120} defaultValue={profile.location} /></label>
            <label>Years of experience<input className="form-control" name="experienceYears" type="number" min="0" max="100" step="1" required defaultValue={profile.experienceYears} /></label>
          </div>
          <label>Primary category
            <select className="form-select" name="categorySlug" required defaultValue={profile.categorySlug}>
              {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
            </select>
          </label>
          <button className="btn btn-dark rounded-pill">Save profile</button>
        </form>
      </section>
      <section id="maker-skills" className="dashboard-card dashboard-skill-card" tabIndex="-1">
        <div className="dashboard-section-heading">
          <span className="dashboard-section-icon" aria-hidden="true">✧</span>
          <div><div className="eyebrow">YOUR CRAFT</div><h2>Your skills</h2></div>
        </div>
        <p>Choose the skills that best describe your work in {profile.categorySlug.replaceAll("-", " ")}.</p>
        {skillOptions.length ? (
          <form onSubmit={saveSkills}>
            <div className="skill-checkboxes">
              {skillOptions.map((skill) => (
                <label key={skill.id}>
                  <input
                    type="checkbox"
                    checked={selectedSkills.includes(skill.id)}
                    onChange={(event) => setSelectedSkills((current) =>
                      event.target.checked
                        ? [...current, skill.id]
                        : current.filter((id) => id !== skill.id)
                    )}
                  />
                  <span>{skill.name}</span>
                </label>
              ))}
            </div>
            <button className="btn btn-dark btn-sm rounded-pill mt-3">Save skills</button>
          </form>
        ) : <p className="dashboard-empty">No active skills are configured for this category yet.</p>}
      </section>
      <div className="dashboard-grid">
        <section id="maker-add-service" className="dashboard-card dashboard-create-card" tabIndex="-1">
          <div className="dashboard-section-heading">
            <span className="dashboard-section-icon" aria-hidden="true">↗</span>
            <div><div className="eyebrow">OFFER YOUR EXPERTISE</div><h2>Add a service</h2></div>
          </div>
          <form className="dashboard-form" onSubmit={(event) => addListing(event, "services")}>
            <input className="form-control" name="title" placeholder="Service name" required minLength={2} maxLength={120} />
            <textarea className="form-control" name="description" placeholder="What does this service include?" maxLength={2000} />
            <input className="form-control" name="price" type="number" min="0" step="0.01" placeholder="Price in ₹" required />
            <button className="btn btn-dark rounded-pill">Add service</button>
          </form>
        </section>
        <section id="maker-add-product" className="dashboard-card dashboard-create-card" tabIndex="-1">
          <div className="dashboard-section-heading">
            <span className="dashboard-section-icon" aria-hidden="true">◇</span>
            <div><div className="eyebrow">SHARE WHAT YOU MAKE</div><h2>Add a handmade product</h2></div>
          </div>
          <form className="dashboard-form" onSubmit={(event) => addListing(event, "products")}>
            <input className="form-control" name="title" placeholder="Product name" required minLength={2} maxLength={120} />
            <textarea className="form-control" name="description" placeholder="Tell customers about it" maxLength={2000} />
            <div className="form-row">
              <input className="form-control" name="price" type="number" min="0" step="0.01" placeholder="Price in ₹" required />
              <input className="form-control" name="stock" type="number" min="0" step="1" placeholder="Stock" required />
            </div>
            <label className="dashboard-file-label">Product photo <input className="form-control" name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            <small className="dashboard-help">JPEG, PNG, or WebP up to 5 MB.</small>
            <button className="btn btn-dark rounded-pill">Add product</button>
          </form>
        </section>
      </div>
      <section id="maker-listings" className="dashboard-card dashboard-listings" tabIndex="-1">
        <div className="dashboard-section-heading">
          <span className="dashboard-section-icon" aria-hidden="true">▤</span>
          <div><div className="eyebrow">YOUR MARKETPLACE PRESENCE</div><h2>Manage your listings</h2></div>
        </div>
        <h3 id="maker-services" className="maker-listing-subheading" tabIndex="-1">Services <span>{listings.services.length}</span></h3>
        {listings.services.length ? listings.services.map((service) => (
          <details className="listing-editor" key={service.id}>
            <summary>
              <span>{service.title} · ₹{Math.round(service.price)}</span>
              <StatusBadge status={service.active ? "available" : "unavailable"} />
            </summary>
            <form className="dashboard-form" onSubmit={(event) => saveListing(event, service, "services")}>
              <input className="form-control" name="title" defaultValue={service.title} required minLength={2} maxLength={120} />
              <textarea className="form-control" name="description" defaultValue={service.description} maxLength={2000} />
              <input className="form-control" name="price" type="number" min="0" step="0.01" defaultValue={service.price} required />
              <label className="listing-active-check"><input type="checkbox" name="active" defaultChecked={service.active} /> Listed publicly</label>
              <button className="btn btn-dark btn-sm rounded-pill">Save service</button>
            </form>
          </details>
        )) : <p className="dashboard-empty">You have not added any services yet.</p>}
        <h3 id="maker-products" className="maker-listing-subheading mt-4" tabIndex="-1">Products <span>{listings.products.length}</span></h3>
        {listings.products.length ? listings.products.map((product) => (
          <details className="listing-editor" key={product.id}>
            <summary>
              <span>{product.title} · ₹{Math.round(product.price)} · {product.stock} in stock</span>
              <StatusBadge status={product.active ? "available" : "unavailable"} />
            </summary>
            <form className="dashboard-form" onSubmit={(event) => saveListing(event, product, "products")}>
              <input className="form-control" name="title" defaultValue={product.title} required minLength={2} maxLength={120} />
              <textarea className="form-control" name="description" defaultValue={product.description} maxLength={2000} />
              <div className="form-row">
                <input className="form-control" name="price" type="number" min="0" step="0.01" defaultValue={product.price} required />
                <input className="form-control" name="stock" type="number" min="0" step="1" defaultValue={product.stock} required />
              </div>
              {product.imageUrl && <img className="listing-image-preview" src={product.imageUrl} alt={`Current photo of ${product.title}`} />}
              <label className="dashboard-file-label">Replace photo <input className="form-control" name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
              <label className="listing-active-check"><input type="checkbox" name="active" defaultChecked={product.active} /> Listed publicly</label>
              <button className="btn btn-dark btn-sm rounded-pill">Save product</button>
            </form>
          </details>
        )) : <p className="dashboard-empty">You have not added any products yet.</p>}
      </section>
      <section id="maker-transactions" className="dashboard-card dashboard-transactions" tabIndex="-1">
        <div className="dashboard-section-heading">
          <span className="dashboard-section-icon" aria-hidden="true">⌁</span>
          <div><div className="eyebrow">STAY CONNECTED</div><h2>Customer activity</h2></div>
        </div>
        <h2>Service requests</h2>
        {transactions.requests.length ? transactions.requests.map((item) => (
          <div className="transaction-row" key={item.id}>
            <div>
              <strong>{item.listing}</strong>
              <span>{item.customerName} · ₹{Math.round(item.amount)}</span>
              {item.requestedFor && <span>Requested for {new Date(item.requestedFor).toLocaleString()}</span>}
              {item.message && <span>Message: {item.message}</span>}
              {item.contactEmail && <a className="transaction-contact" href={`mailto:${item.contactEmail}`}>Contact: {item.contactEmail}</a>}
            </div>
            <StatusBadge status={item.status} />
            <div className="transaction-actions">
              {item.status === "pending" && <>
                <button onClick={() => changeStatus(`/api/service-requests/${item.id}/status`, "accept")}>Accept</button>
                <button onClick={() => changeStatus(`/api/service-requests/${item.id}/status`, "reject")}>Decline</button>
              </>}
              {item.status === "accepted" && <button onClick={() => changeStatus(`/api/service-requests/${item.id}/status`, "start")}>Start</button>}
              {item.status === "in_progress" && <button onClick={() => changeStatus(`/api/service-requests/${item.id}/status`, "complete")}>Complete</button>}
            </div>
          </div>
        )) : <p className="dashboard-empty">No service requests yet.</p>}
        <h2 className="mt-4">Product orders</h2>
        {transactions.orders.length ? transactions.orders.map((item) => (
          <div className="transaction-row" key={item.id}>
            <div>
              <strong>{item.listing}</strong>
              <span>{item.customerName} · ₹{Math.round(item.amount)}</span>
              {item.contactEmail && <a className="transaction-contact" href={`mailto:${item.contactEmail}`}>Contact: {item.contactEmail}</a>}
            </div>
            <StatusBadge status={item.status} />
            <div className="transaction-actions">
              {item.status === "pending_confirmation" && <>
                <button onClick={() => changeStatus(`/api/orders/${item.id}/status`, "confirm")}>Confirm</button>
                <button onClick={() => changeStatus(`/api/orders/${item.id}/status`, "reject")}>Decline</button>
              </>}
              {item.status === "confirmed" && <button onClick={() => changeStatus(`/api/orders/${item.id}/status`, "ready")}>Mark ready</button>}
              {item.status === "ready" && <button onClick={() => changeStatus(`/api/orders/${item.id}/status`, "complete")}>Complete</button>}
            </div>
          </div>
        )) : <p className="dashboard-empty">No product orders yet.</p>}
      </section>
    </section>
  );
}

function CustomerActivity({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dismissToast = useCallback(() => setMessage(""), []);
  const [reviewingId, setReviewingId] = useState(null);
  const [complainingId, setComplainingId] = useState(null);

  useEffect(() => {
    apiRequest("/api/my/transactions")
      .then((result) => setTransactions(result.transactions))
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function cancel(item) {
    setError("");
    setMessage("");
    try {
      const path = item.type === "order" ? `/api/orders/${item.id}/status` : `/api/service-requests/${item.id}/status`;
      await apiRequest(path, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      setTransactions((items) => items.map((entry) =>
        entry.id === item.id ? { ...entry, status: "cancelled" } : entry
      ));
      setMessage(item.type === "order" ? "Your order was cancelled." : "Your service request was cancelled.");
    } catch (cancelError) {
      setError(cancelError.message);
    }
  }

  async function submitReview(item, event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const rating = Number(form.get("rating"));
    const reviewText = form.get("reviewText");
    try {
      await apiRequest("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          ...(item.type === "order" ? { orderId: item.id } : { serviceRequestId: item.id }),
          rating,
          reviewText
        })
      });
      setTransactions((items) => items.map((entry) =>
        entry.id === item.id ? { ...entry, hasReview: true } : entry
      ));
      setReviewingId(null);
      setMessage("Thank you for sharing your feedback.");
    } catch (reviewError) {
      setError(reviewError.message);
    }
  }

  async function submitComplaint(item, event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/complaints", {
        method: "POST",
        body: JSON.stringify({
          ...(item.type === "order" ? { orderId: item.id } : { serviceRequestId: item.id }),
          subject: form.get("subject"),
          description: form.get("description")
        })
      });
      setComplainingId(null);
      setMessage("Your complaint was sent to the HunarHub team.");
    } catch (complaintError) {
      setError(complaintError.message);
    }
  }

  const pendingTransactions = transactions.filter((item) =>
    ["pending", "pending_confirmation", "accepted", "confirmed", "in_progress", "ready"].includes(item.status)
  ).length;
  const completedTransactions = transactions.filter((item) => item.status === "completed").length;

  return (
    <section className="dashboard-page">
      <DashboardHeading
        eyebrow="YOUR HUNARHUB"
        title="My activity"
        description="Track your service requests and product orders, and stay connected with local makers."
        user={user}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <DashboardToast message={message} onDismiss={dismissToast} />
      <div className="dashboard-stats customer-activity-stats">
        <div><span>Total requests and orders</span><strong>{transactions.length}</strong></div>
        <div><span>In progress</span><strong>{pendingTransactions}</strong></div>
        <div><span>Completed</span><strong>{completedTransactions}</strong></div>
      </div>
      <section className="dashboard-card customer-activity-card">
        <div className="customer-activity-heading">
          <div>
            <h2>Orders and service requests</h2>
            <p>Your recent activity with HunarHub makers.</p>
          </div>
          <span className="activity-count">{transactions.length} {transactions.length === 1 ? "item" : "items"}</span>
        </div>
        {transactions.length ? transactions.map((item) => (
          <div className="customer-activity-item" key={`${item.type}-${item.id}`}>
            <div className="transaction-row">
              <div>
                <strong>{item.listing}</strong>
                <span>{item.entrepreneurName} · ₹{Math.round(item.amount)} · {new Date(item.createdAt).toLocaleDateString()}</span>
                {item.requestedFor && <span>Requested for {new Date(item.requestedFor).toLocaleString()}</span>}
                {item.contactEmail && <a className="transaction-contact" href={`mailto:${item.contactEmail}`}>Contact maker: {item.contactEmail}</a>}
              </div>
              <StatusBadge status={item.status} />
              {["pending", "pending_confirmation"].includes(item.status) &&
                <button className="inline-action" onClick={() => cancel(item)}>Cancel</button>}
              {item.status === "completed" && !item.hasReview && (
                <button className="inline-action" onClick={() => { setReviewingId(item.id); setComplainingId(null); setError(""); setMessage(""); }}>
                  Leave a review
                </button>
              )}
              {item.status === "completed" && item.hasReview && <span className="review-submitted">Review submitted</span>}
              <button className="inline-action" onClick={() => { setComplainingId(item.id); setReviewingId(null); setError(""); setMessage(""); }}>
                Report an issue
              </button>
            </div>
            {reviewingId === item.id && (
              <form className="review-form" onSubmit={(event) => submitReview(item, event)}>
                <label>
                  Your rating
                  <select className="form-select form-select-sm" name="rating" defaultValue="5" required>
                    <option value="5">5 — Excellent</option>
                    <option value="4">4 — Very good</option>
                    <option value="3">3 — Good</option>
                    <option value="2">2 — Could be better</option>
                    <option value="1">1 — Not satisfied</option>
                  </select>
                </label>
                <label>
                  Tell others about your experience (optional)
                  <textarea className="form-control form-control-sm" name="reviewText" maxLength={1000} rows={3} />
                </label>
                <div className="review-actions">
                  <button className="btn btn-dark btn-sm rounded-pill" type="submit">Submit review</button>
                  <button className="btn btn-outline-secondary btn-sm rounded-pill" type="button" onClick={() => setReviewingId(null)}>Cancel</button>
                </div>
              </form>
            )}
            {complainingId === item.id && (
              <form className="review-form" onSubmit={(event) => submitComplaint(item, event)}>
                <label>
                  Subject
                  <input className="form-control form-control-sm" name="subject" required minLength={3} maxLength={120} />
                </label>
                <label>
                  What happened?
                  <textarea className="form-control form-control-sm" name="description" required minLength={10} maxLength={3000} rows={3} />
                </label>
                <div className="review-actions">
                  <button className="btn btn-dark btn-sm rounded-pill" type="submit">Send complaint</button>
                  <button className="btn btn-outline-secondary btn-sm rounded-pill" type="button" onClick={() => setComplainingId(null)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        )) : (
          <div className="customer-activity-empty">
            <span className="customer-empty-icon" aria-hidden="true">✳</span>
            <strong>Your HunarHub activity starts here</strong>
            <p>When you request a service or order a handmade product, you’ll find its progress here.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function AdminDashboard({ user }) {
  const [overview, setOverview] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [catalog, setCatalog] = useState({ categories: [], skills: [] });
  const [reports, setReports] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionType, setTransactionType] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [overviewData, complaintData, catalogData, reportData] = await Promise.all([
      apiRequest("/api/admin/overview"),
      apiRequest("/api/admin/complaints"),
      apiRequest("/api/admin/catalog"),
      apiRequest("/api/admin/reports")
    ]);
    setOverview(overviewData);
    setComplaints(complaintData.complaints);
    setCatalog(catalogData);
    setReports(reportData);
    await loadTransactions();
  }

  async function loadTransactions(type = transactionType, status = transactionStatus) {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    const result = await apiRequest(`/api/admin/transactions?${params.toString()}`);
    setTransactions(result.transactions);
  }

  useEffect(() => {
    load().catch((loadError) => setError(loadError.message));
  }, []);

  async function decide(id, decision) {
    const reason = decision === "reject" ? window.prompt("Reason for rejection?") : "";
    if (decision === "reject" && !reason) return;
    try {
      await apiRequest(`/api/admin/entrepreneurs/${id}/verification`, {
        method: "PATCH",
        body: JSON.stringify({ decision, reason })
      });
      await load();
    } catch (decisionError) {
      setError(decisionError.message);
    }
  }

  async function updateComplaint(complaint, status) {
    const resolution = status === "resolved"
      ? window.prompt("Add a resolution note.")
      : complaint.resolution;
    if (status === "resolved" && !resolution) return;
    try {
      await apiRequest(`/api/admin/complaints/${complaint.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, resolution })
      });
      await load();
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function addCatalogItem(event, type) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = type === "categories"
      ? { name: form.get("name") }
      : { categoryId: form.get("categoryId"), name: form.get("name") };
    try {
      await apiRequest(`/api/admin/${type}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      formElement.reset();
      await load();
    } catch (catalogError) {
      setError(catalogError.message);
    }
  }

  async function toggleCatalogItem(type, item) {
    try {
      await apiRequest(`/api/admin/${type}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      });
      await load();
    } catch (catalogError) {
      setError(catalogError.message);
    }
  }

  async function updateReportRange(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const from = values.get("from");
    const to = values.get("to");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const reportData = await apiRequest(`/api/admin/reports?${params.toString()}`);
      setReports(reportData);
    } catch (reportError) {
      setError(reportError.message);
    }
  }

  function navigateToSection(sectionId, transactionFilter, statusFilter = "") {
    if (transactionFilter !== undefined || statusFilter) {
      const nextType = transactionFilter ?? "";
      setTransactionType(nextType);
      setTransactionStatus(statusFilter);
      loadTransactions(nextType, statusFilter).catch((loadError) => setError(loadError.message));
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!overview) return <section className="dashboard-page">{error ? <div className="alert alert-danger">{error}</div> : "Loading admin overview…"}</section>;

  return (
    <section className="dashboard-page">
      <DashboardHeading
        eyebrow="PLATFORM OPERATIONS"
        title="Admin dashboard"
        description="Review applications, oversee marketplace activity, and manage platform settings."
        user={user}
      />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="dashboard-stats">
        <button className="dashboard-stat-card" type="button" aria-label="View customer activity" onClick={() => navigateToSection("admin-customer-activity")}>
          <span>Customers</span><strong>{overview.customers}</strong>
        </button>
        <button className="dashboard-stat-card" type="button" aria-label="View entrepreneur approvals" onClick={() => navigateToSection("admin-entrepreneur-verification")}>
          <span>Entrepreneurs</span><strong>{overview.entrepreneurs}</strong>
        </button>
        <button className="dashboard-stat-card" type="button" aria-label="View orders" onClick={() => navigateToSection("admin-transactions", "order")}>
          <span>Orders</span><strong>{overview.orders}</strong>
        </button>
        <button className="dashboard-stat-card" type="button" aria-label="View service requests" onClick={() => navigateToSection("admin-transactions", "service_request")}>
          <span>Service requests</span><strong>{overview.serviceRequests}</strong>
        </button>
      </div>
      <section id="admin-customer-activity" className="dashboard-card admin-customer-card" tabIndex="-1">
        <h2>Customer activity</h2>
        <p>Overview of registered customer accounts and recent marketplace activity.</p>
        <div className="dashboard-stats report-stats">
          <div><span>Registered customers</span><strong>{overview.customers}</strong></div>
          {reports && <div><span>Active customers in report period</span><strong>{reports.activeCustomers}</strong></div>}
        </div>
        {reports && <p className="report-caption">{reports.from || "Last 30 days"}{reports.to ? ` through ${reports.to}` : ""}</p>}
      </section>
      {reports && (
        <section className="dashboard-card admin-report-card">
          <div className="admin-section-heading">
            <div><h2>Marketplace performance</h2><p>Completed transactions and service request conversion.</p></div>
            <form className="report-range-form" onSubmit={updateReportRange}>
              <label>From<input className="form-control form-control-sm" name="from" type="date" /></label>
              <label>To<input className="form-control form-control-sm" name="to" type="date" /></label>
              <button className="btn btn-dark btn-sm rounded-pill">Apply</button>
            </form>
          </div>
          <div className="dashboard-stats report-stats">
            <button className="dashboard-stat-card" type="button" aria-label="View all service requests" onClick={() => navigateToSection("admin-transactions", "service_request")}>
              <span>Requests submitted</span><strong>{reports.serviceRequestsSubmitted}</strong>
            </button>
            <button className="dashboard-stat-card" type="button" aria-label="View accepted service requests" onClick={() => navigateToSection("admin-transactions", "service_request", "accepted")}>
              <span>Requests accepted</span><strong>{reports.serviceRequestsAccepted}</strong>
            </button>
            <button className="dashboard-stat-card" type="button" aria-label="View service request conversion details" onClick={() => navigateToSection("admin-transactions", "service_request")}>
              <span>Request conversion</span><strong>{reports.serviceRequestConversionPercent}%</strong>
            </button>
            <button className="dashboard-stat-card" type="button" aria-label="View customer activity" onClick={() => navigateToSection("admin-customer-activity")}>
              <span>Active customers</span><strong>{reports.activeCustomers}</strong>
            </button>
            <button className="dashboard-stat-card" type="button" aria-label="View completed transactions" onClick={() => navigateToSection("admin-transactions", "", "completed")}>
              <span>Completed marketplace value</span><strong>₹{Math.round(reports.completedMarketplaceValue)}</strong>
            </button>
            <button className="dashboard-stat-card" type="button" aria-label="View completed maker transactions" onClick={() => navigateToSection("admin-transactions", "", "completed")}>
              <span>Average maker earnings</span><strong>₹{Math.round(reports.averageEntrepreneurEarnings)}</strong>
            </button>
          </div>
          <p className="report-caption">
            {reports.from || "Last 30 days"}{reports.to ? ` through ${reports.to}` : ""}
          </p>
        </section>
      )}
      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h2>Marketplace categories</h2>
          <form className="catalog-create-form" onSubmit={(event) => addCatalogItem(event, "categories")}>
            <label className="visually-hidden" htmlFor="new-category-name">New category name</label>
            <input id="new-category-name" className="form-control" name="name" placeholder="New category name" required minLength={2} maxLength={80} />
            <button className="btn btn-dark btn-sm rounded-pill">Add</button>
          </form>
          <div className="catalog-list">
            {catalog.categories.map((category) => (
              <div className="catalog-row" key={category.id}>
                <span>{category.name}</span>
                <button className={`catalog-toggle ${category.active ? "is-active" : ""}`} onClick={() => toggleCatalogItem("categories", category)}>
                  {category.active ? "Active" : "Inactive"}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="dashboard-card">
          <h2>Skills</h2>
          <form className="catalog-create-form catalog-skill-form" onSubmit={(event) => addCatalogItem(event, "skills")}>
            <label className="visually-hidden" htmlFor="new-skill-category">Skill category</label>
            <select id="new-skill-category" className="form-select" name="categoryId" required defaultValue="">
              <option value="" disabled>Choose category</option>
              {catalog.categories.filter((category) => category.active).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <label className="visually-hidden" htmlFor="new-skill-name">New skill name</label>
            <input id="new-skill-name" className="form-control" name="name" placeholder="New skill name" required minLength={2} maxLength={80} />
            <button className="btn btn-dark btn-sm rounded-pill">Add</button>
          </form>
          <div className="catalog-list">
            {catalog.skills.map((skill) => (
              <div className="catalog-row" key={skill.id}>
                <span>{skill.name} <small>{skill.categoryName}</small></span>
                <button className={`catalog-toggle ${skill.active ? "is-active" : ""}`} onClick={() => toggleCatalogItem("skills", skill)}>
                  {skill.active ? "Active" : "Inactive"}
                </button>
              </div>
            ))}
            {!catalog.skills.length && <p className="dashboard-empty">No skills added yet.</p>}
          </div>
        </section>
      </div>
      <section id="admin-entrepreneur-verification" className="dashboard-card" tabIndex="-1">
        <h2>Entrepreneur verification</h2>
        {overview.pendingVerifications.length ? overview.pendingVerifications.map((item) => (
          <div className="transaction-row" key={item.id}>
            <div><strong>{item.displayName}</strong><span>{item.category} · {item.location}</span></div>
            <div className="transaction-actions">
              <button onClick={() => decide(item.id, "approve")}>Approve</button>
              <button onClick={() => decide(item.id, "reject")}>Reject</button>
            </div>
          </div>
        )) : <p className="dashboard-empty">No profiles need review.</p>}
      </section>
      <section id="admin-transactions" className="dashboard-card mt-4" tabIndex="-1">
        <div className="admin-section-heading">
          <h2>Orders and service requests</h2>
          <div className="report-range-form">
            <label>
              Type
              <select className="form-select form-select-sm" value={transactionType} onChange={(event) => {
                const nextType = event.target.value;
                setTransactionType(nextType);
                loadTransactions(nextType, transactionStatus).catch((loadError) => setError(loadError.message));
              }}>
                <option value="">All</option>
                <option value="order">Orders</option>
                <option value="service_request">Service requests</option>
              </select>
            </label>
            <label>
              Status
              <select className="form-select form-select-sm" value={transactionStatus} onChange={(event) => {
                const nextStatus = event.target.value;
                setTransactionStatus(nextStatus);
                loadTransactions(transactionType, nextStatus).catch((loadError) => setError(loadError.message));
              }}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="pending_confirmation">Awaiting confirmation</option>
                <option value="accepted">Accepted</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In progress</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>
        </div>
        {transactions.length ? transactions.map((item) => (
          <div className="transaction-row" key={`${item.type}-${item.id}`}>
            <div><strong>{item.listing}</strong><span>{item.customerName} → {item.entrepreneurName} · {new Date(item.createdAt).toLocaleDateString()}</span></div>
            <StatusBadge status={item.status} />
            <strong>₹{Math.round(item.amount)}</strong>
          </div>
        )) : <p className="dashboard-empty">No matching transactions.</p>}
      </section>
      <section className="dashboard-card mt-4">
        <h2>Customer complaints</h2>
        {complaints.length ? complaints.map((complaint) => (
          <article className="complaint-item" key={complaint.id}>
            <div className="transaction-row">
              <div><strong>{complaint.subject}</strong><span>{complaint.reporterName} · {new Date(complaint.createdAt).toLocaleDateString()}</span></div>
              <StatusBadge status={complaint.status} />
            </div>
            <p>{complaint.description}</p>
            {complaint.status !== "resolved" && (
              <div className="transaction-actions">
                {complaint.status === "open" && <button onClick={() => updateComplaint(complaint, "in_progress")}>Start review</button>}
                <button onClick={() => updateComplaint(complaint, "resolved")}>Resolve</button>
              </div>
            )}
          </article>
        )) : <p className="dashboard-empty">No complaints to review.</p>}
      </section>
    </section>
  );
}

export default function Dashboard({ user }) {
  if (user.role === "entrepreneur") return <EntrepreneurDashboard user={user} />;
  if (user.role === "admin") return <AdminDashboard user={user} />;
  return <CustomerActivity user={user} />;
}
