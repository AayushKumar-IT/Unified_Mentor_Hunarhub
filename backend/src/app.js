import express from "express";
import { pool } from "./db.js";
import { authenticate } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { managementRouter } from "./routes/management.js";
import { transactionsRouter } from "./routes/transactions.js";
import { mediaRouter } from "./routes/media.js";
import { notificationsRouter } from "./routes/notifications.js";
import { isUuid } from "./validation.js";
import { fileURLToPath } from "node:url";

export const app = express();

app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
const mediaDirectory = fileURLToPath(new URL("../uploads/", import.meta.url));
app.use("/media", express.static(mediaDirectory, {
  dotfiles: "deny",
  index: false,
  maxAge: "7d",
  setHeaders(response) {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  }
}));
app.use(authenticate);
app.use("/api", mediaRouter);
app.use("/api", notificationsRouter);
app.use("/api/auth", authRouter);
app.use("/api", transactionsRouter);
app.use("/api", managementRouter);

app.get("/api/health", async (_request, response, next) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/categories", async (_request, response, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, slug
       FROM categories
       WHERE active = TRUE
       ORDER BY sort_order, name`
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/entrepreneurs/:id", async (request, response, next) => {
  if (!isUuid(request.params.id)) {
    return response.status(400).json({
      error: { code: "INVALID_ENTREPRENEUR_ID", message: "Provide a valid entrepreneur ID." }
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.display_name AS "displayName", p.bio, p.location,
              p.experience_years AS "experienceYears", p.availability_status AS availability,
              p.image_url AS "imageUrl",
              p.verification_status AS "verificationStatus",
              c.name AS category, c.slug AS "categorySlug",
              COALESCE((
                SELECT json_agg(json_build_object('id', skill.id, 'name', skill.name) ORDER BY skill.name)
                FROM entrepreneur_skills es
                JOIN skills skill ON skill.id = es.skill_id AND skill.active = TRUE
                WHERE es.entrepreneur_id = p.id
              ), '[]'::json) AS skills,
              COALESCE(ROUND((
                SELECT AVG(rating)::numeric
                FROM reviews
                WHERE entrepreneur_id = p.id AND status = 'published'
              ), 1), 0)::float AS rating,
              (
                SELECT COUNT(*)::int
                FROM reviews
                WHERE entrepreneur_id = p.id AND status = 'published'
              ) AS "reviewCount"
       FROM entrepreneur_profiles p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.active = TRUE
         AND p.verification_status = 'verified'
         AND c.active = TRUE`,
      [request.params.id]
    );
    if (!rows[0]) {
      return response.status(404).json({
        error: { code: "ENTREPRENEUR_NOT_FOUND", message: "Marketplace profile not found." }
      });
    }

    const [services, products] = await Promise.all([
      pool.query(
        `SELECT id, title, description, price_amount::float AS price
         FROM services
         WHERE entrepreneur_id = $1 AND active = TRUE
         ORDER BY price_amount, title`,
        [request.params.id]
      ),
      pool.query(
        `SELECT id, title, description, price_amount::float AS price,
                stock_quantity AS stock, image_url AS "imageUrl"
         FROM products
         WHERE entrepreneur_id = $1 AND active = TRUE AND stock_quantity > 0
         ORDER BY featured DESC, created_at DESC`,
        [request.params.id]
      )
    ]);
    return response.json({ ...rows[0], services: services.rows, products: products.rows });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/entrepreneurs/:id/reviews", async (request, response, next) => {
  if (!isUuid(request.params.id)) {
    return response.status(400).json({
      error: { code: "INVALID_ENTREPRENEUR_ID", message: "Provide a valid entrepreneur ID." }
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.rating, r.review_text AS "reviewText",
              u.display_name AS "customerName", r.created_at AS "createdAt"
       FROM reviews r
       JOIN entrepreneur_profiles p ON p.id = r.entrepreneur_id
       LEFT JOIN users u ON u.id = r.customer_id
       WHERE r.entrepreneur_id = $1 AND r.status = 'published'
         AND p.active = TRUE
         AND p.verification_status = 'verified'
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [request.params.id]
    );
    return response.json({ reviews: rows });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/products/:id", async (request, response, next) => {
  if (!isUuid(request.params.id)) {
    return response.status(400).json({
      error: { code: "INVALID_PRODUCT_ID", message: "Provide a valid product ID." }
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT pr.id, pr.title, pr.description, pr.price_amount::float AS price,
              pr.stock_quantity AS stock, pr.image_url AS "imageUrl",
              p.id AS "entrepreneurId", p.display_name AS "sellerName",
              p.location, c.name AS category
       FROM products pr
       JOIN entrepreneur_profiles p ON p.id = pr.entrepreneur_id
       JOIN categories c ON c.id = p.category_id
       WHERE pr.id = $1 AND pr.active = TRUE AND pr.stock_quantity > 0
         AND p.active = TRUE AND p.verification_status = 'verified' AND c.active = TRUE`,
      [request.params.id]
    );
    if (!rows[0]) {
      return response.status(404).json({
        error: { code: "PRODUCT_NOT_FOUND", message: "Available product not found." }
      });
    }
    return response.json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/skills", async (request, response, next) => {
  const values = [];
  let filter = "s.active = TRUE AND c.active = TRUE";
  if (request.query.category) {
    values.push(request.query.category);
    filter += ` AND c.slug = $${values.length}`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.slug, c.name AS category, c.slug AS "categorySlug"
       FROM skills s
       JOIN categories c ON c.id = s.category_id
       WHERE ${filter}
       ORDER BY c.sort_order, c.name, s.name`,
      values
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

function readPriceRange(query, response) {
  const minPrice = query.minPrice === undefined ? undefined : Number(query.minPrice);
  const maxPrice = query.maxPrice === undefined ? undefined : Number(query.maxPrice);

  if (
    (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
    (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
    (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
  ) {
    response.status(400).json({
      error: { code: "INVALID_PRICE_RANGE", message: "Provide a valid non-negative price range." }
    });
    return null;
  }

  return { minPrice, maxPrice };
}

app.get("/api/entrepreneurs", async (request, response, next) => {
  const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 12, 1), 48);
  const offset = Math.min(Math.max(Number.parseInt(request.query.offset, 10) || 0, 0), 1000000);
  const values = [];
  const filters = ["p.verification_status = 'verified'", "p.active = TRUE"];
  filters.push("c.active = TRUE");
  const priceRange = readPriceRange(request.query, response);
  if (!priceRange) return;
  const servicePriceFilters = [];

  if (request.query.category) {
    values.push(request.query.category);
    filters.push(`c.slug = $${values.length}`);
  }
  if (request.query.location) {
    values.push(`%${request.query.location}%`);
    filters.push(`p.location ILIKE $${values.length}`);
  }
  if (request.query.search) {
    values.push(`%${request.query.search}%`);
    filters.push(`(p.display_name ILIKE $${values.length} OR p.bio ILIKE $${values.length})`);
  }
  if (request.query.skillId) {
    if (!isUuid(request.query.skillId)) {
      return response.status(400).json({
        error: { code: "INVALID_SKILL_ID", message: "Provide a valid skill filter." }
      });
    }
    values.push(request.query.skillId);
    filters.push(`EXISTS (
      SELECT 1
      FROM entrepreneur_skills es
      JOIN skills skill ON skill.id = es.skill_id AND skill.active = TRUE
      WHERE es.entrepreneur_id = p.id AND skill.id = $${values.length}
    )`);
  }
  if (priceRange.minPrice !== undefined) {
    values.push(priceRange.minPrice);
    servicePriceFilters.push(`sf.price_amount >= $${values.length}`);
  }
  if (priceRange.maxPrice !== undefined) {
    values.push(priceRange.maxPrice);
    servicePriceFilters.push(`sf.price_amount <= $${values.length}`);
  }
  if (servicePriceFilters.length > 0) {
    filters.push(`EXISTS (SELECT 1 FROM services sf WHERE sf.entrepreneur_id = p.id AND sf.active = TRUE AND ${servicePriceFilters.join(" AND ")})`);
  }

  values.push(limit);
  values.push(offset);
  try {
    const { rows } = await pool.query(
      `SELECT p.id,
              p.display_name AS "displayName",
              p.bio,
              p.location,
              p.experience_years AS "experienceYears",
              p.image_url AS "imageUrl",
              p.verification_status AS "verificationStatus",
              c.name AS category,
              c.slug AS "categorySlug",
              first_service.id AS "firstServiceId",
              first_service.title AS "firstServiceTitle",
              COALESCE((
                SELECT json_agg(json_build_object('id', skill.id, 'name', skill.name) ORDER BY skill.name)
                FROM entrepreneur_skills es
                JOIN skills skill ON skill.id = es.skill_id AND skill.active = TRUE
                WHERE es.entrepreneur_id = p.id
              ), '[]'::json) AS skills,
              COALESCE(MIN(s.price_amount), 0)::float AS "startingPrice",
              COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::float AS rating,
              COUNT(DISTINCT r.id)::int AS "reviewCount"
       FROM entrepreneur_profiles p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN services s ON s.entrepreneur_id = p.id AND s.active = TRUE
       LEFT JOIN LATERAL (
         SELECT service.id, service.title
         FROM services service
         WHERE service.entrepreneur_id = p.id AND service.active = TRUE
         ORDER BY service.price_amount, service.title
         LIMIT 1
       ) first_service ON TRUE
       LEFT JOIN reviews r ON r.entrepreneur_id = p.id AND r.status = 'published'
       WHERE ${filters.join(" AND ")}
       GROUP BY p.id, c.name, c.slug, first_service.id, first_service.title
       ORDER BY p.featured DESC, p.display_name
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    response.set("X-Has-More", String(rows.length === limit));
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", async (request, response, next) => {
  const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 8, 1), 48);
  const offset = Math.min(Math.max(Number.parseInt(request.query.offset, 10) || 0, 0), 1000000);
  const values = [];
  const filters = [
    "pr.active = TRUE",
    "pr.stock_quantity > 0",
    "p.active = TRUE",
    "p.verification_status = 'verified'",
    "c.active = TRUE"
  ];
  const priceRange = readPriceRange(request.query, response);
  if (!priceRange) return;

  if (request.query.category) {
    values.push(request.query.category);
    filters.push(`c.slug = $${values.length}`);
  }
  if (request.query.location) {
    values.push(`%${request.query.location}%`);
    filters.push(`p.location ILIKE $${values.length}`);
  }
  if (request.query.search) {
    values.push(`%${request.query.search}%`);
    filters.push(`(pr.title ILIKE $${values.length} OR pr.description ILIKE $${values.length} OR p.display_name ILIKE $${values.length})`);
  }
  if (request.query.skillId) {
    if (!isUuid(request.query.skillId)) {
      return response.status(400).json({
        error: { code: "INVALID_SKILL_ID", message: "Provide a valid skill filter." }
      });
    }
    values.push(request.query.skillId);
    filters.push(`EXISTS (
      SELECT 1
      FROM entrepreneur_skills es
      JOIN skills skill ON skill.id = es.skill_id AND skill.active = TRUE
      WHERE es.entrepreneur_id = p.id AND skill.id = $${values.length}
    )`);
  }
  if (priceRange.minPrice !== undefined) {
    values.push(priceRange.minPrice);
    filters.push(`pr.price_amount >= $${values.length}`);
  }
  if (priceRange.maxPrice !== undefined) {
    values.push(priceRange.maxPrice);
    filters.push(`pr.price_amount <= $${values.length}`);
  }

  values.push(limit);
  values.push(offset);
  try {
    const { rows } = await pool.query(
      `SELECT pr.id,
              pr.title,
              pr.description,
              pr.price_amount::float AS price,
              pr.image_url AS "imageUrl",
              p.display_name AS "sellerName",
              p.location
       FROM products pr
       JOIN entrepreneur_profiles p ON p.id = pr.entrepreneur_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${filters.join(" AND ")}
       ORDER BY pr.featured DESC, pr.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    response.set("X-Has-More", String(rows.length === limit));
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "API endpoint not found." }
  });
});

app.use((error, _request, response, _next) => {
  console.error("API request failed:", error);
  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "The request could not be completed." }
  });
});
