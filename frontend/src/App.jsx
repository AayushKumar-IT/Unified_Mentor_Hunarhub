import { useEffect, useState } from "react";
import { apiRequest } from "./api.js";
import AuthDialog from "./auth/AuthDialog.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import Dashboard from "./dashboard/Dashboard.jsx";
import DetailsDialog from "./marketplace/DetailsDialog.jsx";
import NotificationCenter from "./notifications/NotificationCenter.jsx";

const categoryIcons = {
  cobbler: "👞",
  potter: "🏺",
  tailor: "🧵",
  artisan: "🪡",
  "small-vendor": "🧺"
};

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Marketplace data could not be loaded (${response.status}).`);
  }
  return response.json();
}

async function getPage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Marketplace data could not be loaded (${response.status}).`);
  }
  return {
    items: await response.json(),
    hasMore: response.headers.get("X-Has-More") === "true"
  };
}

function App() {
  const { user, signOut } = useAuth();
  const [categories, setCategories] = useState([]);
  const [entrepreneurs, setEntrepreneurs] = useState([]);
  const [products, setProducts] = useState([]);
  const [moreMakers, setMoreMakers] = useState(false);
  const [moreProducts, setMoreProducts] = useState(false);
  const [loadingMore, setLoadingMore] = useState("");
  const [category, setCategory] = useState("");
  const [skill, setSkill] = useState("");
  const [skillOptions, setSkillOptions] = useState([]);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authRole, setAuthRole] = useState("customer");
  const [selection, setSelection] = useState(null);
  const [view, setView] = useState("home");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (user && user.role !== "customer") setView("dashboard");
  }, [user]);

  useEffect(() => {
    getJson("/api/categories")
      .then(setCategories)
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    let active = true;
    const url = category
      ? `/api/skills?category=${encodeURIComponent(category)}`
      : "/api/skills";
    getJson(url)
      .then((skills) => {
        if (!active) return;
        setSkillOptions(skills);
        if (skill && !skills.some((item) => item.id === skill)) setSkill("");
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, [category]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ limit: "12", offset: "0" });
    if (category) params.set("category", category);
    if (skill) params.set("skillId", skill);
    if (search.trim()) params.set("search", search.trim());
    if (location.trim()) params.set("location", location.trim());
    if (priceRange) {
      const [minPrice, maxPrice] = priceRange.split("-");
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
    }

    Promise.allSettled([
      getPage(`/api/entrepreneurs?${params.toString()}`),
      getPage(`/api/products?${params.toString()}`)
    ])
      .then(([entrepreneurResult, productResult]) => {
        if (!active) return;
        const failures = [];
        if (entrepreneurResult.status === "fulfilled") {
          setEntrepreneurs(entrepreneurResult.value.items);
          setMoreMakers(entrepreneurResult.value.hasMore);
        } else {
          setEntrepreneurs([]);
          setMoreMakers(false);
          failures.push(`Local makers could not be loaded. ${entrepreneurResult.reason instanceof Error ? entrepreneurResult.reason.message : "Please try again."}`);
        }
        if (productResult.status === "fulfilled") {
          setProducts(productResult.value.items);
          setMoreProducts(productResult.value.hasMore);
        } else {
          setProducts([]);
          setMoreProducts(false);
          failures.push(`Products could not be loaded. ${productResult.reason instanceof Error ? productResult.reason.message : "Please try again."}`);
        }
        setError(failures.join(" "));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [category, skill, search, location, priceRange]);

  function getCurrentFilters(offset) {
    const params = new URLSearchParams({ limit: "12", offset: String(offset) });
    if (category) params.set("category", category);
    if (skill) params.set("skillId", skill);
    if (search.trim()) params.set("search", search.trim());
    if (location.trim()) params.set("location", location.trim());
    if (priceRange) {
      const [minPrice, maxPrice] = priceRange.split("-");
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
    }
    return params;
  }

  async function loadMore(type) {
    const isMaker = type === "maker";
    setLoadingMore(type);
    setError("");
    try {
      const currentItems = isMaker ? entrepreneurs : products;
      const path = isMaker ? "/api/entrepreneurs" : "/api/products";
      const page = await getPage(`${path}?${getCurrentFilters(currentItems.length)}`);
      if (isMaker) {
        setEntrepreneurs((current) => [...current, ...page.items]);
        setMoreMakers(page.hasMore);
      } else {
        setProducts((current) => [...current, ...page.items]);
        setMoreProducts(page.hasMore);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingMore("");
    }
  }

  function clearFilters() {
    setCategory("");
    setSkill("");
    setSearch("");
    setLocation("");
    setPriceRange("");
  }

  function openAuth(mode = "login", role = "customer") {
    setAuthMode(mode);
    setAuthRole(role);
    setDialogOpen(true);
  }

  async function requestService({ serviceId, requestedFor, message }) {
    if (!user) {
      setSelection(null);
      openAuth("login", "customer");
      throw new Error("Sign in with a customer account to request a service.");
    }
    if (user.role !== "customer") {
      throw new Error("Sign in with a customer account to request a service.");
    }
    await apiRequest("/api/service-requests", {
      method: "POST",
      body: JSON.stringify({ serviceId, requestedFor, message })
    });
    setNotice("Your service request has been sent.");
    setSelection(null);
  }

  async function orderProduct(productId, quantity) {
    if (!user) {
      setSelection(null);
      openAuth("login", "customer");
      throw new Error("Sign in with a customer account to place an order.");
    }
    if (user.role !== "customer") {
      throw new Error("Sign in with a customer account to place an order.");
    }
    await apiRequest("/api/orders", {
      method: "POST",
      body: JSON.stringify({ productId, quantity })
    });
    setNotice("Your order request has been sent to the maker.");
    setSelection(null);
  }

  return (
    <>
      <header className="site-header">
        <nav className="navbar container py-3" aria-label="Main navigation">
          <a className="brand-mark" href="#" aria-label="HunarHub home">
            <span className="brand-icon">h</span>
            <span>hunar<span className="brand-light">hub</span></span>
          </a>
          <div className="nav-actions">
            {user && (
              <button
                className="nav-account-link"
                type="button"
                onClick={() => setView(view === "home" ? "dashboard" : "home")}
                aria-label={view === "home" ? "Open your dashboard" : "Return to the marketplace"}
              >
                <span className="nav-account-avatar" aria-hidden="true">
                  {Array.from(user.displayName?.trim() || "H")[0]?.toLocaleUpperCase() ?? "H"}
                </span>
                <span className="nav-account-copy">
                  <strong>{view === "home" ? "My HunarHub" : "Marketplace"}</strong>
                  <small>{view === "home" ? user.displayName : "Continue exploring"}</small>
                </span>
              </button>
            )}
            <NotificationCenter />
            {view === "home" && <a className="nav-link d-none d-sm-inline" href="#makers">Explore makers</a>}
            {user ? (
              <button className="btn btn-outline-dark btn-sm rounded-pill px-3" type="button" onClick={() => signOut().then(() => { setView("home"); setNotice(""); }).catch((signOutError) => setNotice(signOutError.message))}>Sign out</button>
            ) : (
              <>
                <button className="btn btn-outline-dark btn-sm rounded-pill px-3" type="button" onClick={() => openAuth("login")}>Sign in</button>
                <button className="btn btn-dark btn-sm rounded-pill px-3" type="button" onClick={() => openAuth("register", "entrepreneur")}>Join as a maker</button>
              </>
            )}
          </div>
        </nav>
      </header>

      {view === "dashboard" && user ? (
        <main className="container"><Dashboard user={user} /></main>
      ) : <main>
        {notice && <div className="container pt-3"><div className="alert alert-info alert-dismissible" role="status">{notice}<button className="btn-close" aria-label="Dismiss" onClick={() => setNotice("")} /></div></div>}
        <section className="hero-section">
          <div className="container hero-content">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-dot" /> GOOD WORK, CLOSE TO HOME</div>
              <h1>Find your local<br />kind of <span>wonderful.</span></h1>
              <p className="hero-subtitle">
                Meet the talented people behind the things you love. Find a
                trusted local service or a handmade piece with a story.
              </p>
              <form className="search-panel" onSubmit={(event) => event.preventDefault()}>
                <label className="search-field">
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Search skills or makers"
                    placeholder="What are you looking for?"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <span className="search-divider" />
                <label className="search-field location-field">
                  <span aria-hidden="true">⌖</span>
                  <input
                    aria-label="Location"
                    placeholder="Your neighbourhood"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </label>
                <button className="search-button" aria-label="Search HunarHub" type="submit">→</button>
              </form>
              <div className="hero-note"><span>✳</span> Every purchase keeps a local skill thriving.</div>
            </div>
            <div className="hero-art" aria-label="Illustration of a local potter at work" role="img">
              <div className="sun-shape" />
              <div className="art-label"><span>MADE BY HAND</span><b>Made with meaning.</b></div>
              <div className="pottery pottery-back" />
              <div className="pottery pottery-front"><span /></div>
              <div className="art-plant"><i /><i /><i /><b /></div>
              <div className="art-stem stem-one" />
              <div className="art-stem stem-two" />
              <div className="art-stem stem-three" />
              <div className="art-base" />
            </div>
          </div>
          <div className="hero-bottom container">
            <div><strong>Community craft.</strong> Remarkable skills.</div>
            <div className="hero-rating"><span>★★★★★</span> Local love, five stars at a time</div>
          </div>
        </section>

        <section className="category-section container" aria-labelledby="category-title">
          <div className="section-heading">
            <div>
              <div className="eyebrow">A LITTLE BIT OF EVERYTHING</div>
              <h2 id="category-title">What do you need today?</h2>
            </div>
            <button className="text-link" type="button" onClick={clearFilters}>See all categories <span>↗</span></button>
          </div>
          <div className="category-row">
            <button
              className={`category-tile ${category === "" ? "selected" : ""}`}
              type="button"
              onClick={() => setCategory("")}
              aria-pressed={category === ""}
            >
              <span className="category-icon all-icon">✳</span><span>Everything</span>
            </button>
            {categories.map((item) => (
              <button
                className={`category-tile ${category === item.slug ? "selected" : ""}`}
                key={item.id}
                type="button"
                onClick={() => setCategory(item.slug)}
                aria-pressed={category === item.slug}
              >
                <span className="category-icon">{categoryIcons[item.slug] ?? "✳"}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="makers-section" id="makers">
          <div className="container">
            <div className="section-heading makers-heading">
              <div>
                <div className="eyebrow">GOOD HANDS, RIGHT AROUND YOU</div>
                <h2>People worth knowing.</h2>
              </div>
              <div className="maker-filters">
                <label className="visually-hidden" htmlFor="skill-filter">Filter by skill</label>
                <select
                  className="form-select form-select-sm price-filter"
                  id="skill-filter"
                  value={skill}
                  onChange={(event) => setSkill(event.target.value)}
                >
                  <option value="">All skills</option>
                  {skillOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <label className="visually-hidden" htmlFor="price-range">Filter by price range</label>
                <select
                  className="form-select form-select-sm price-filter"
                  id="price-range"
                  value={priceRange}
                  onChange={(event) => setPriceRange(event.target.value)}
                >
                  <option value="">Any price</option>
                  <option value="0-300">₹0–₹300</option>
                  <option value="301-800">₹301–₹800</option>
                  <option value="801-1500">₹801–₹1,500</option>
                  <option value="1501-">₹1,501+</option>
                </select>
                <span className="result-count">{entrepreneurs.length} local makers</span>
              </div>
            </div>
            {error && (
              <div className="alert alert-warning" role="alert">
                {error} Check your connection and try again.
              </div>
            )}
            {loading ? (
              <div className="loading-state" role="status">Finding your local makers…</div>
            ) : entrepreneurs.length > 0 ? (
              <div className="row g-4">
                {entrepreneurs.map((maker, index) => (
                  <div className="col-md-4" key={maker.id}>
                    <article className="maker-card">
                      <div className={`maker-photo maker-photo-${(index % 3) + 1}`}>
                        {maker.imageUrl && (
                          <img
                            className="maker-portrait"
                            src={maker.imageUrl}
                            alt={maker.displayName}
                            loading="lazy"
                          />
                        )}
                        {!maker.imageUrl && <span className="maker-initial">{maker.displayName.charAt(0)}</span>}
                        <span className="photo-category">{maker.category}</span>
                        <span className="verified-badge">✓ Verified</span>
                      </div>
                      <div className="maker-card-body">
                        <div className="maker-meta">{maker.location} <span>·</span> {maker.experienceYears} years of craft</div>
                        <h3>{maker.displayName}</h3>
                        <p>{maker.bio}</p>
                        {maker.skills?.length > 0 && (
                          <div className="maker-skills">
                            {maker.skills.slice(0, 3).map((makerSkill) => (
                              <span key={makerSkill.id}>{makerSkill.name}</span>
                            ))}
                          </div>
                        )}
                        <div className="maker-card-footer">
                          <span className="maker-rating"><b>★ {maker.rating ? maker.rating.toFixed(1) : "New"}</b>{maker.reviewCount > 0 && ` (${maker.reviewCount})`}</span>
                          <span>From <strong>₹{Math.round(maker.startingPrice)}</strong></span>
                        </div>
                        <button className="maker-request-button" type="button" onClick={() => setSelection({ type: "maker", id: maker.id })}>
                          View profile and services <span>→</span>
                        </button>
                      </div>
                    </article>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>✳</span>
                <h3>No makers found just yet.</h3>
                <p>Try a different search or clear your filters.</p>
                <button className="btn btn-dark rounded-pill px-4" onClick={clearFilters}>Clear filters</button>
              </div>
            )}
            {moreMakers && !loading && (
              <div className="load-more-row">
                <button className="btn btn-outline-dark rounded-pill px-4" disabled={loadingMore === "maker"} onClick={() => loadMore("maker")}>
                  {loadingMore === "maker" ? "Loading makers…" : "Load more makers"}
                </button>
              </div>
            )}
            <div className="section-footnote"><span>✳</span> Sample profiles are labeled; verified makers are real community entrepreneurs.</div>
          </div>
        </section>

        <section className="products-section container">
          <div className="section-heading">
            <div>
              <div className="eyebrow">A STORY IN EVERY STITCH & STROKE</div>
              <h2>Handmade, heart included.</h2>
            </div>
            <a className="text-link" href="#makers">Browse handmade goods <span>↗</span></a>
          </div>
          <div className="row g-4">
            {products.map((product, index) => (
              <div className="col-6 col-lg-4" key={product.id}>
                <article className="product-card">
                  <div className={`product-art product-art-${(index % 3) + 1}`}>
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.title} loading="lazy" />
                      : <span aria-hidden="true">{["◒", "✿", "◉"][index]}</span>}
                  </div>
                  <div className="product-info">
                    <div className="product-maker">{product.sellerName} · {product.location}</div>
                    <h3>{product.title}</h3>
                    <div className="product-price">₹{Math.round(product.price)}</div>
                    <button className="product-order-button" onClick={() => setSelection({ type: "product", id: product.id })}>View item <span>→</span></button>
                  </div>
                </article>
              </div>
            ))}
            {!loading && products.length === 0 && !error && (
              <div className="col-12"><p className="text-secondary">New handmade finds are on their way.</p></div>
            )}
          </div>
          {moreProducts && !loading && (
            <div className="load-more-row">
              <button className="btn btn-outline-dark rounded-pill px-4" disabled={loadingMore === "product"} onClick={() => loadMore("product")}>
                {loadingMore === "product" ? "Loading products…" : "Load more products"}
              </button>
            </div>
          )}
        </section>

        <section className="maker-cta">
          <div className="container maker-cta-inner">
            <div><div className="eyebrow">YOUR SKILL DESERVES TO BE SEEN</div><h2>Make your work<br />part of the story.</h2></div>
            <div className="cta-side"><p>Bring your craft to more people in your community. Your HunarHub journey starts with a hello.</p><button className="btn btn-light rounded-pill px-4" onClick={() => user ? (user.role === "entrepreneur" ? setView("dashboard") : setNotice("Sign out of your customer account to register as a maker.")) : openAuth("register", "entrepreneur")}>I’m a maker <span>↗</span></button></div>
          </div>
        </section>
      </main>}

      <footer className="site-footer">
        <div className="container footer-inner">
          <a className="brand-mark footer-brand" href="#"><span className="brand-icon">h</span><span>hunar<span className="brand-light">hub</span></span></a>
          <span>Local hands. Lasting stories.</span>
          <span>Made with care, for the people who make.</span>
        </div>
      </footer>
      <AuthDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        categories={categories}
        initialMode={authMode}
        initialRole={authRole}
      />
      <DetailsDialog
        selection={selection}
        onClose={() => setSelection(null)}
        onRequestService={requestService}
        onOrderProduct={orderProduct}
        onViewProduct={(productId) => setSelection({ type: "product", id: productId })}
      />
    </>
  );
}

export default App;
