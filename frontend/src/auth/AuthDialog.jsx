import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

export default function AuthDialog({ open, onClose, categories, initialMode = "login", initialRole = "customer" }) {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState(initialRole);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setRole(initialRole);
      setError("");
    }
  }, [open, initialMode, initialRole]);

  if (!open) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    try {
      if (mode === "login") {
        await signIn({ email: values.email, password: values.password });
      } else {
        await register({
          email: values.email,
          password: values.password,
          displayName: values.displayName,
          role,
          ...(role === "entrepreneur"
            ? { categorySlug: values.categorySlug, location: values.location }
            : {})
        });
      }
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        <div className="eyebrow">{mode === "login" ? "WELCOME BACK" : "JOIN THE COMMUNITY"}</div>
        <h2 id="auth-title">{mode === "login" ? "Sign in to HunarHub" : "Create your account"}</h2>
        <p>Find local talent and help good work thrive.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <>
              <label>
                Your name
                <input className="form-control" name="displayName" autoComplete="name" required minLength={2} maxLength={100} />
              </label>
              <label>
                I want to
                <select className="form-select" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="customer">Find and support local makers</option>
                  <option value="entrepreneur">Offer my services or products</option>
                </select>
              </label>
              {role === "entrepreneur" && (
                <>
                  <label>
                    Craft or category
                    <select className="form-select" name="categorySlug" required>
                      <option value="">Select a category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.slug}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Your town or neighbourhood
                    <input className="form-control" name="location" required maxLength={120} />
                  </label>
                </>
              )}
            </>
          )}
          <label>
            Email address
            <input className="form-control" name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label>
            Password
            <input className="form-control" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} maxLength={128} required />
            {mode === "register" && <small>Use at least 10 characters.</small>}
          </label>
          {error && <div className="alert alert-danger py-2 mb-0" role="alert">{error}</div>}
          <button className="btn btn-dark rounded-pill w-100 py-2" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? "New to HunarHub?" : "Already have an account?"}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </div>
      </section>
    </div>
  );
}
