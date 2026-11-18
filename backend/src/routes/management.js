import { Router } from "express";
import { pool, rollbackTransaction } from "../db.js";
import { requireRole, requireTrustedOrigin } from "../auth.js";
import { isUuid, isLocalImageUrl } from "../validation.js";
import { createNotification } from "../notifications.js";

export const managementRouter = Router();

function catalogSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getEntrepreneurProfile(userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.display_name AS "displayName", p.bio, p.location,
            p.experience_years AS "experienceYears", p.availability_status AS availability,
            p.verification_status AS "verificationStatus", c.slug AS "categorySlug",
            (
              SELECT NULLIF(audit.reason, '')
              FROM admin_audit_log audit
              WHERE audit.entity_type = 'entrepreneur_profile'
                AND audit.entity_id = p.id
                AND audit.action = 'reject'
              ORDER BY audit.created_at DESC
              LIMIT 1
            ) AS "verificationMessage",
            COALESCE((
              SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
              FROM entrepreneur_skills es
              JOIN skills s ON s.id = es.skill_id AND s.active = TRUE
              WHERE es.entrepreneur_id = p.id
            ), '[]'::json) AS skills
     FROM entrepreneur_profiles p
     JOIN categories c ON c.id = p.category_id
     WHERE p.user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

managementRouter.get(
  "/entrepreneur/profile",
  requireRole("entrepreneur"),
  async (request, response, next) => {
    try {
      const profile = await getEntrepreneurProfile(request.user.id);
      if (!profile) {
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      return response.json(profile);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.patch(
  "/entrepreneur/profile",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    const { displayName, bio, location, experienceYears, categorySlug } = request.body ?? {};
    if (
      typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 100 ||
      typeof bio !== "string" || bio.length > 2000 ||
      typeof location !== "string" || location.trim().length < 2 || location.trim().length > 120 ||
      !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 100 ||
      typeof categorySlug !== "string"
    ) {
      return response.status(400).json({
        error: { code: "INVALID_PROFILE", message: "Review the profile fields and try again." }
      });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows: categories } = await client.query(
        "SELECT id FROM categories WHERE slug = $1 AND active = TRUE",
        [categorySlug]
      );
      if (!categories[0]) {
        await client.query("ROLLBACK");
        return response.status(400).json({
          error: { code: "INVALID_CATEGORY", message: "Select an active marketplace category." }
        });
      }
      const current = await client.query(
        "SELECT id, category_id AS \"categoryId\" FROM entrepreneur_profiles WHERE user_id = $1 FOR UPDATE",
        [request.user.id]
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      const { rows } = await client.query(
        `UPDATE entrepreneur_profiles
         SET display_name = $2, bio = $3, location = $4, experience_years = $5, category_id = $6,
             verification_status = CASE
               WHEN category_id <> $6 THEN 'pending'
               ELSE verification_status
             END
         WHERE user_id = $1
         RETURNING id, display_name AS "displayName", bio, location,
                   experience_years AS "experienceYears", verification_status AS "verificationStatus"`,
        [request.user.id, displayName.trim(), bio.trim(), location.trim(), experienceYears, categories[0].id]
      );
      await client.query("UPDATE users SET display_name = $2 WHERE id = $1", [request.user.id, displayName.trim()]);
      if (current.rows[0].categoryId !== categories[0].id) {
        await client.query(
          "DELETE FROM entrepreneur_skills WHERE entrepreneur_id = $1",
          [current.rows[0].id]
        );
      }
      await client.query("COMMIT");
      return response.json(rows[0]);
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

managementRouter.post(
  "/entrepreneur/profile/resubmit",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    try {
      const { rows } = await pool.query(
        `UPDATE entrepreneur_profiles
         SET verification_status = 'pending'
         WHERE user_id = $1 AND verification_status = 'rejected'
         RETURNING id, verification_status AS "verificationStatus"`,
        [request.user.id]
      );
      if (!rows[0]) {
        return response.status(409).json({
          error: { code: "APPLICATION_NOT_RESUBMITTABLE", message: "Only a rejected application can be resubmitted." }
        });
      }
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.patch(
  "/entrepreneur/availability",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    const { availability } = request.body ?? {};
    if (!["available", "unavailable"].includes(availability)) {
      return response.status(400).json({
        error: { code: "INVALID_AVAILABILITY", message: "Choose available or unavailable." }
      });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE entrepreneur_profiles SET availability_status = $2
         WHERE user_id = $1
         RETURNING availability_status AS availability`,
        [request.user.id, availability]
      );
      if (!rows[0]) {
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.put(
  "/entrepreneur/skills",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    const { skillIds } = request.body ?? {};
    if (!Array.isArray(skillIds) || skillIds.length > 30 ||
        !skillIds.every(isUuid) || new Set(skillIds).size !== skillIds.length) {
      return response.status(400).json({
        error: { code: "INVALID_SKILLS", message: "Choose up to 30 unique valid skills." }
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows: profiles } = await client.query(
        "SELECT id, category_id AS \"categoryId\" FROM entrepreneur_profiles WHERE user_id = $1 FOR UPDATE",
        [request.user.id]
      );
      const profile = profiles[0];
      if (!profile) {
        await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      const { rows: skills } = await client.query(
        `SELECT id, name FROM skills
         WHERE category_id = $1 AND active = TRUE AND id = ANY($2::uuid[])`,
        [profile.categoryId, skillIds]
      );
      if (skills.length !== skillIds.length) {
        await client.query("ROLLBACK");
        return response.status(400).json({
          error: { code: "INVALID_SKILL_SELECTION", message: "Choose active skills from your profile category." }
        });
      }
      await client.query("DELETE FROM entrepreneur_skills WHERE entrepreneur_id = $1", [profile.id]);
      if (skillIds.length > 0) {
        await client.query(
          `INSERT INTO entrepreneur_skills (entrepreneur_id, skill_id)
           SELECT $1, selected_skill
           FROM UNNEST($2::uuid[]) AS selected_skill`,
          [profile.id, skillIds]
        );
      }
      await client.query("COMMIT");
      return response.json({ skills });
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

managementRouter.get(
  "/entrepreneur/listings",
  requireRole("entrepreneur"),
  async (request, response, next) => {
    try {
      const profile = await getEntrepreneurProfile(request.user.id);
      if (!profile) {
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      const [services, products] = await Promise.all([
        pool.query(
          `SELECT id, title, description, price_amount::float AS price, active
           FROM services WHERE entrepreneur_id = $1 ORDER BY title`,
          [profile.id]
        ),
        pool.query(
          `SELECT id, title, description, price_amount::float AS price,
                  stock_quantity AS stock, active
           FROM products WHERE entrepreneur_id = $1 ORDER BY title`,
          [profile.id]
        )
      ]);
      return response.json({ services: services.rows, products: products.rows });
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.post(
  "/entrepreneur/services",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    const { title, description = "", price } = request.body ?? {};
    if (
      typeof title !== "string" || title.trim().length < 2 || title.trim().length > 120 ||
      typeof description !== "string" || description.length > 2000 ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 10000000
    ) {
      return response.status(400).json({
        error: { code: "INVALID_SERVICE", message: "Enter a title, description, and valid price." }
      });
    }
    try {
      const profile = await getEntrepreneurProfile(request.user.id);
      if (!profile) {
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      const { rows } = await pool.query(
        `INSERT INTO services (entrepreneur_id, title, description, price_amount)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, description, price_amount::float AS price, active`,
        [profile.id, title.trim(), description.trim(), price]
      );
      return response.status(201).json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.patch(
  "/entrepreneur/services/:id",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_LISTING_ID", message: "Provide a valid listing ID." }
      });
    }
    const { title, description = "", price, active = true } = request.body ?? {};
    if (
      typeof title !== "string" || title.trim().length < 2 || title.trim().length > 120 ||
      typeof description !== "string" || description.length > 2000 ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 10000000 ||
      typeof active !== "boolean"
    ) {
      return response.status(400).json({
        error: { code: "INVALID_SERVICE", message: "Enter a title, description, valid price, and active state." }
      });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE services s
         SET title = $3, description = $4, price_amount = $5, active = $6
         FROM entrepreneur_profiles p
         WHERE s.id = $1 AND s.entrepreneur_id = p.id AND p.user_id = $2
         RETURNING s.id, s.title, s.description, s.price_amount::float AS price, s.active`,
        [request.params.id, request.user.id, title.trim(), description.trim(), price, active]
      );
      if (!rows[0]) {
        return response.status(404).json({
          error: { code: "SERVICE_NOT_FOUND", message: "Service listing not found." }
        });
      }
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.post(
  "/entrepreneur/products",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    const { title, description = "", price, stock = 0, imageUrl = null } = request.body ?? {};
    if (
      typeof title !== "string" || title.trim().length < 2 || title.trim().length > 120 ||
      typeof description !== "string" || description.length > 2000 ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 10000000 ||
      !Number.isInteger(stock) || stock < 0 || stock > 1000000 ||
      !isLocalImageUrl(imageUrl)
    ) {
      return response.status(400).json({
        error: { code: "INVALID_PRODUCT", message: "Enter a title, description, valid price, and stock quantity." }
      });
    }
    try {
      const profile = await getEntrepreneurProfile(request.user.id);
      if (!profile) {
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      const { rows } = await pool.query(
        `INSERT INTO products (entrepreneur_id, title, description, price_amount, stock_quantity, image_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, description, price_amount::float AS price,
                   stock_quantity AS stock, image_url AS "imageUrl", active`,
        [profile.id, title.trim(), description.trim(), price, stock, imageUrl]
      );
      return response.status(201).json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.patch(
  "/entrepreneur/products/:id",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_LISTING_ID", message: "Provide a valid listing ID." }
      });
    }
    const { title, description = "", price, stock, active = true, imageUrl = null } = request.body ?? {};
    if (
      typeof title !== "string" || title.trim().length < 2 || title.trim().length > 120 ||
      typeof description !== "string" || description.length > 2000 ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 10000000 ||
      !Number.isInteger(stock) || stock < 0 || stock > 1000000 ||
      typeof active !== "boolean" ||
      !isLocalImageUrl(imageUrl)
    ) {
      return response.status(400).json({
        error: { code: "INVALID_PRODUCT", message: "Enter a title, description, valid price, stock, and active state." }
      });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE products pr
         SET title = $3, description = $4, price_amount = $5, stock_quantity = $6,
             active = $7, image_url = COALESCE($8, pr.image_url)
         FROM entrepreneur_profiles p
         WHERE pr.id = $1 AND pr.entrepreneur_id = p.id AND p.user_id = $2
         RETURNING pr.id, pr.title, pr.description, pr.price_amount::float AS price,
                   pr.stock_quantity AS stock, pr.image_url AS "imageUrl", pr.active`,
        [request.params.id, request.user.id, title.trim(), description.trim(), price, stock, active, imageUrl]
      );
      if (!rows[0]) {
        return response.status(404).json({
          error: { code: "PRODUCT_NOT_FOUND", message: "Product listing not found." }
        });
      }
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.get(
  "/entrepreneur/earnings",
  requireRole("entrepreneur"),
  async (request, response, next) => {
    try {
      const profile = await getEntrepreneurProfile(request.user.id);
      if (!profile) {
        return response.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Entrepreneur profile not found." }
        });
      }
      const { rows } = await pool.query(
        `SELECT COALESCE((
                  SELECT SUM(o.subtotal)
                  FROM orders o
                  WHERE o.entrepreneur_id = $1 AND o.status = 'completed'
                ), 0)::float
                + COALESCE((
                  SELECT SUM(sr.agreed_price)
                  FROM service_requests sr
                  WHERE sr.entrepreneur_id = $1 AND sr.status = 'completed'
                ), 0)::float AS "completedEarnings",
                (SELECT COUNT(*)::int FROM orders WHERE entrepreneur_id = $1 AND status = 'completed')
                + (SELECT COUNT(*)::int FROM service_requests WHERE entrepreneur_id = $1 AND status = 'completed')
                  AS "completedTransactions"`,
        [profile.id]
      );
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.get(
  "/admin/overview",
  requireRole("admin"),
  async (_request, response, next) => {
    try {
      const [counts, pending] = await Promise.all([
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM users WHERE role = 'customer' AND active = TRUE) AS customers,
             (SELECT COUNT(*)::int FROM entrepreneur_profiles WHERE active = TRUE) AS entrepreneurs,
             (SELECT COUNT(*)::int FROM orders) AS orders,
             (SELECT COUNT(*)::int FROM service_requests) AS "serviceRequests"`
        ),
        pool.query(
          `SELECT p.id, p.display_name AS "displayName", p.location,
                  c.name AS category, p.created_at AS "createdAt"
           FROM entrepreneur_profiles p
           JOIN categories c ON c.id = p.category_id
           WHERE p.verification_status = 'pending'
           ORDER BY p.created_at`
        )
      ]);
      return response.json({ ...counts.rows[0], pendingVerifications: pending.rows });
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.get(
  "/admin/reports",
  requireRole("admin"),
  async (request, response, next) => {
    const from = request.query.from;
    const to = request.query.to;
    const validDate = (value) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    };
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
      return response.status(400).json({
        error: { code: "INVALID_REPORT_RANGE", message: "Choose a valid date range." }
      });
    }

    try {
      const { rows } = await pool.query(
        `WITH service_totals AS (
           SELECT COUNT(*)::int AS submitted,
                  COUNT(*) FILTER (
                    WHERE EXISTS (
                      SELECT 1 FROM transaction_events event
                      WHERE event.transaction_type = 'service_request'
                        AND event.transaction_id = sr.id
                        AND event.new_status = 'accepted'
                    )
                  )::int AS accepted,
                  COUNT(*) FILTER (WHERE sr.status = 'completed')::int AS completed,
                  COALESCE(SUM(sr.agreed_price) FILTER (WHERE sr.status = 'completed'), 0)::float AS earnings
           FROM service_requests sr
           WHERE sr.created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
             AND sr.created_at < COALESCE($2::date + INTERVAL '1 day', NOW() + INTERVAL '1 day')
         ),
         order_totals AS (
           SELECT COUNT(*)::int AS submitted,
                  COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed,
                  COALESCE(SUM(o.subtotal) FILTER (WHERE o.status = 'completed'), 0)::float AS earnings
           FROM orders o
           WHERE o.created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
             AND o.created_at < COALESCE($2::date + INTERVAL '1 day', NOW() + INTERVAL '1 day')
         ),
         active_customers AS (
           SELECT COUNT(DISTINCT customer_id)::int AS total
           FROM (
             SELECT customer_id
             FROM service_requests
             WHERE created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
               AND created_at < COALESCE($2::date + INTERVAL '1 day', NOW() + INTERVAL '1 day')
             UNION
             SELECT customer_id
             FROM orders
             WHERE created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
               AND created_at < COALESCE($2::date + INTERVAL '1 day', NOW() + INTERVAL '1 day')
           ) customer_activity
         ),
         entrepreneur_earnings AS (
           SELECT entrepreneur_id,
                  SUM(amount) AS total
           FROM (
             SELECT entrepreneur_id, agreed_price AS amount
             FROM service_requests
             WHERE status = 'completed'
               AND created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
               AND created_at < COALESCE($2::date + INTERVAL '1 day', NOW() + INTERVAL '1 day')
             UNION ALL
             SELECT entrepreneur_id, subtotal AS amount
             FROM orders
             WHERE status = 'completed'
               AND created_at >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
               AND created_at < COALESCE($2::date + INTERVAL '1 day', NOW() + INTERVAL '1 day')
           ) completed_activity
           GROUP BY entrepreneur_id
         )
         SELECT service_totals.submitted AS "serviceRequestsSubmitted",
                service_totals.accepted AS "serviceRequestsAccepted",
                service_totals.completed AS "serviceRequestsCompleted",
                CASE WHEN service_totals.submitted = 0 THEN 0
                     ELSE ROUND(service_totals.accepted * 100.0 / service_totals.submitted, 1)
                END AS "serviceRequestConversionPercent",
                order_totals.submitted AS "ordersSubmitted",
                order_totals.completed AS "ordersCompleted",
                (service_totals.earnings + order_totals.earnings)::float AS "completedMarketplaceValue",
                active_customers.total AS "activeCustomers",
                COALESCE((
                  SELECT ROUND(AVG(total)::numeric, 2)::float
                  FROM entrepreneur_earnings
                ), 0)::float AS "averageEntrepreneurEarnings"
         FROM service_totals CROSS JOIN order_totals CROSS JOIN active_customers`,
        [from || null, to || null]
      );
      return response.json({ from: from || null, to: to || null, ...rows[0] });
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.get(
  "/admin/transactions",
  requireRole("admin"),
  async (request, response, next) => {
    const type = request.query.type;
    const status = request.query.status;
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 50, 1), 100);
    if (type && !["order", "service_request"].includes(type)) {
      return response.status(400).json({
        error: { code: "INVALID_TRANSACTION_TYPE", message: "Choose order or service_request." }
      });
    }

    try {
      const resultSets = [];
      if (!type || type === "service_request") {
        const { rows } = await pool.query(
          `SELECT sr.id, 'service_request' AS type, sr.status,
                  sr.agreed_price::float AS amount, sr.created_at AS "createdAt",
                  customer.display_name AS "customerName",
                  entrepreneur.display_name AS "entrepreneurName",
                  service.title AS listing
           FROM service_requests sr
           JOIN users customer ON customer.id = sr.customer_id
           JOIN entrepreneur_profiles entrepreneur ON entrepreneur.id = sr.entrepreneur_id
           JOIN services service ON service.id = sr.service_id
           WHERE ($1::text IS NULL OR sr.status = $1)
           ORDER BY sr.created_at DESC
           LIMIT $2`,
          [status || null, limit]
        );
        resultSets.push(...rows);
      }
      if (!type || type === "order") {
        const { rows } = await pool.query(
          `SELECT o.id, 'order' AS type, o.status,
                  o.subtotal::float AS amount, o.created_at AS "createdAt",
                  customer.display_name AS "customerName",
                  entrepreneur.display_name AS "entrepreneurName",
                  STRING_AGG(item.product_title || ' × ' || item.quantity, ', ') AS listing
           FROM orders o
           JOIN users customer ON customer.id = o.customer_id
           JOIN entrepreneur_profiles entrepreneur ON entrepreneur.id = o.entrepreneur_id
           JOIN order_items item ON item.order_id = o.id
           WHERE ($1::text IS NULL OR o.status = $1)
           GROUP BY o.id, customer.display_name, entrepreneur.display_name
           ORDER BY o.created_at DESC
           LIMIT $2`,
          [status || null, limit]
        );
        resultSets.push(...rows);
      }
      resultSets.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
      return response.json({ transactions: resultSets.slice(0, limit) });
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.patch(
  "/admin/entrepreneurs/:id/verification",
  requireTrustedOrigin,
  requireRole("admin"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_APPLICATION_ID", message: "Provide a valid application ID." }
      });
    }
    const { decision, reason = "" } = request.body ?? {};
    if (!["approve", "reject"].includes(decision) ||
        typeof reason !== "string" || reason.length > 1000 ||
        (decision === "reject" && reason.trim().length < 3)) {
      return response.status(400).json({
        error: { code: "INVALID_DECISION", message: "Choose approve or reject; rejection requires a reason." }
      });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE entrepreneur_profiles
         SET verification_status = $2
         WHERE id = $1 AND verification_status = 'pending'
        RETURNING id, user_id AS "userId",
                  verification_status AS "verificationStatus"`,
        [request.params.id, decision === "approve" ? "verified" : "rejected"]
      );
      if (!rows[0]) {
        if (client) await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "APPLICATION_NOT_FOUND", message: "Pending entrepreneur application not found." }
        });
      }
      await client.query(
        `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, 'entrepreneur_profile', $3, $4)`,
        [request.user.id, decision, rows[0].id, reason.trim()]
      );
      await createNotification(client, {
        userId: rows[0].userId,
        type: "verification",
        title: decision === "approve" ? "Profile verified" : "Profile needs changes",
        message: decision === "approve"
          ? "Your entrepreneur profile is now verified and visible in the marketplace."
          : `Your profile was not approved. ${reason.trim()}`,
        referenceType: "entrepreneur_profile",
        referenceId: rows[0].id
      });
      await client.query("COMMIT");
      return response.json(rows[0]);
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

managementRouter.post(
  "/complaints",
  requireTrustedOrigin,
  requireRole("customer"),
  async (request, response, next) => {
    const { orderId, serviceRequestId, subject, description } = request.body ?? {};
    const hasOneTransaction = Boolean(orderId) !== Boolean(serviceRequestId);
    if (
      !hasOneTransaction ||
      (orderId && !isUuid(orderId)) ||
      (serviceRequestId && !isUuid(serviceRequestId)) ||
      typeof subject !== "string" || subject.trim().length < 3 || subject.trim().length > 120 ||
      typeof description !== "string" || description.trim().length < 10 || description.trim().length > 3000
    ) {
      return response.status(400).json({
        error: { code: "INVALID_COMPLAINT", message: "Provide one transaction, a short subject, and a description." }
      });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const transaction = orderId
        ? await client.query("SELECT id FROM orders WHERE id = $1 AND customer_id = $2", [orderId, request.user.id])
        : await client.query("SELECT id FROM service_requests WHERE id = $1 AND customer_id = $2", [serviceRequestId, request.user.id]);
      if (!transaction.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "TRANSACTION_NOT_FOUND", message: "Transaction not found." }
        });
      }
      const { rows } = await client.query(
        `INSERT INTO complaints (reporter_id, order_id, service_request_id, subject, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status, created_at AS "createdAt"`,
        [request.user.id, orderId ?? null, serviceRequestId ?? null, subject.trim(), description.trim()]
      );
      await client.query(
        `INSERT INTO notifications
           (user_id, notification_type, title, message, reference_type, reference_id)
         SELECT id, 'complaint', 'New customer complaint', $1, 'complaint', $2
         FROM users WHERE role = 'admin' AND active = TRUE`,
        [subject.trim(), rows[0].id]
      );
      await client.query("COMMIT");
      return response.status(201).json(rows[0]);
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

managementRouter.get(
  "/admin/complaints",
  requireRole("admin"),
  async (_request, response, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.id, c.subject, c.description, c.status, c.resolution,
                c.created_at AS "createdAt", u.display_name AS "reporterName",
                c.order_id AS "orderId", c.service_request_id AS "serviceRequestId"
         FROM complaints c
         JOIN users u ON u.id = c.reporter_id
         ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                  c.created_at`
      );
      return response.json({ complaints: rows });
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.patch(
  "/admin/complaints/:id",
  requireTrustedOrigin,
  requireRole("admin"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_COMPLAINT_ID", message: "Provide a valid complaint ID." }
      });
    }
    const { status, resolution = "" } = request.body ?? {};
    if (!["open", "in_progress", "resolved"].includes(status) ||
        typeof resolution !== "string" || resolution.length > 2000 ||
        (status === "resolved" && resolution.trim().length < 3)) {
      return response.status(400).json({
        error: { code: "INVALID_COMPLAINT_UPDATE", message: "Choose a valid status; resolution requires a note." }
      });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE complaints
         SET status = $2, resolution = $3, assigned_admin_id = $4, updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, resolution, reporter_id AS "reporterId"`,
        [request.params.id, status, resolution.trim(), request.user.id]
      );
      if (!rows[0]) {
        if (client) await client.query("ROLLBACK");
        return response.status(404).json({
          error: { code: "COMPLAINT_NOT_FOUND", message: "Complaint not found." }
        });
      }
      await client.query(
        `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, 'complaint', $3, $4)`,
        [request.user.id, status, rows[0].id, resolution.trim()]
      );
      await createNotification(client, {
        userId: rows[0].reporterId,
        type: "complaint_update",
        title: "Complaint update",
        message: status === "resolved"
          ? "Your complaint has been reviewed and resolved."
          : "The HunarHub team has updated your complaint.",
        referenceType: "complaint",
        referenceId: rows[0].id
      });
      await client.query("COMMIT");
      return response.json(rows[0]);
    } catch (error) {
      await rollbackTransaction(client);
      return next(error);
    } finally {
      client?.release();
    }
  }
);

managementRouter.get(
  "/admin/catalog",
  requireRole("admin"),
  async (_request, response, next) => {
    try {
      const [categories, skills] = await Promise.all([
        pool.query(
          `SELECT id, name, slug, active, sort_order AS "sortOrder"
           FROM categories ORDER BY sort_order, name`
        ),
        pool.query(
          `SELECT s.id, s.name, s.slug, s.active, s.category_id AS "categoryId",
                  c.name AS "categoryName"
           FROM skills s
           JOIN categories c ON c.id = s.category_id
           ORDER BY c.sort_order, c.name, s.name`
        )
      ]);
      return response.json({ categories: categories.rows, skills: skills.rows });
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.post(
  "/admin/categories",
  requireTrustedOrigin,
  requireRole("admin"),
  async (request, response, next) => {
    const { name, sortOrder = 0 } = request.body ?? {};
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80 ||
        !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
      return response.status(400).json({
        error: { code: "INVALID_CATEGORY", message: "Enter a category name and a valid sort order." }
      });
    }
    const slug = catalogSlug(name);
    if (!slug) {
      return response.status(400).json({
        error: { code: "INVALID_CATEGORY_NAME", message: "Category name must contain letters or numbers." }
      });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO categories (name, slug, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug, active, sort_order AS "sortOrder"`,
        [name.trim(), slug, sortOrder]
      );
      await pool.query(
        `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, reason)
         VALUES ($1, 'create', 'category', $2, $3)`,
        [request.user.id, rows[0].id, rows[0].name]
      );
      return response.status(201).json(rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return response.status(409).json({
          error: { code: "CATEGORY_EXISTS", message: "A category with this name already exists." }
        });
      }
      return next(error);
    }
  }
);

managementRouter.patch(
  "/admin/categories/:id",
  requireTrustedOrigin,
  requireRole("admin"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_CATEGORY_ID", message: "Provide a valid category ID." }
      });
    }
    const { active } = request.body ?? {};
    if (typeof active !== "boolean") {
      return response.status(400).json({
        error: { code: "INVALID_CATEGORY_STATUS", message: "Category active status must be true or false." }
      });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE categories SET active = $2
         WHERE id = $1
         RETURNING id, name, slug, active, sort_order AS "sortOrder"`,
        [request.params.id, active]
      );
      if (!rows[0]) {
        return response.status(404).json({
          error: { code: "CATEGORY_NOT_FOUND", message: "Category not found." }
        });
      }
      await pool.query(
        `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, 'category', $3, $4)`,
        [request.user.id, active ? "activate" : "deactivate", rows[0].id, rows[0].name]
      );
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);

managementRouter.post(
  "/admin/skills",
  requireTrustedOrigin,
  requireRole("admin"),
  async (request, response, next) => {
    const { categoryId, name } = request.body ?? {};
    if (!isUuid(categoryId) || typeof name !== "string" ||
        name.trim().length < 2 || name.trim().length > 80) {
      return response.status(400).json({
        error: { code: "INVALID_SKILL", message: "Choose a category and enter a valid skill name." }
      });
    }
    const slug = catalogSlug(name);
    if (!slug) {
      return response.status(400).json({
        error: { code: "INVALID_SKILL_NAME", message: "Skill name must contain letters or numbers." }
      });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO skills (category_id, name, slug)
         SELECT id, $2, $3 FROM categories
         WHERE id = $1 AND active = TRUE
         RETURNING id, category_id AS "categoryId", name, slug, active`,
        [categoryId, name.trim(), slug]
      );
      if (!rows[0]) {
        return response.status(404).json({
          error: { code: "CATEGORY_NOT_FOUND", message: "Active category not found." }
        });
      }
      await pool.query(
        `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, reason)
         VALUES ($1, 'create', 'skill', $2, $3)`,
        [request.user.id, rows[0].id, rows[0].name]
      );
      return response.status(201).json(rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return response.status(409).json({
          error: { code: "SKILL_EXISTS", message: "This skill already exists in the category." }
        });
      }
      return next(error);
    }
  }
);

managementRouter.patch(
  "/admin/skills/:id",
  requireTrustedOrigin,
  requireRole("admin"),
  async (request, response, next) => {
    if (!isUuid(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_SKILL_ID", message: "Provide a valid skill ID." }
      });
    }
    const { active } = request.body ?? {};
    if (typeof active !== "boolean") {
      return response.status(400).json({
        error: { code: "INVALID_SKILL_STATUS", message: "Skill active status must be true or false." }
      });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE skills
         SET active = $2
         WHERE id = $1
         RETURNING id, category_id AS "categoryId", name, slug, active`,
        [request.params.id, active]
      );
      if (!rows[0]) {
        return response.status(404).json({
          error: { code: "SKILL_NOT_FOUND", message: "Skill not found." }
        });
      }
      await pool.query(
        `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, 'skill', $3, $4)`,
        [request.user.id, active ? "activate" : "deactivate", rows[0].id, rows[0].name]
      );
      return response.json(rows[0]);
    } catch (error) {
      return next(error);
    }
  }
);
