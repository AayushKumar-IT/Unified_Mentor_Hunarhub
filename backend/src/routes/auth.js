import { createHash } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { pool, rollbackTransaction } from "../db.js";
import {
  authenticate,
  clearSessionCookie,
  createSession,
  requireTrustedOrigin,
  readSessionToken,
} from "../auth.js";
import { hashPassword, verifyPassword } from "../passwords.js";

export const authRouter = Router();
const registrationLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({
    error: { code: "RATE_LIMITED", message: "Too many sign-up attempts. Please try again later." }
  })
});
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({
    error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Please try again later." }
  })
});

authRouter.post("/register", requireTrustedOrigin, registrationLimit, async (request, response, next) => {
  const { email, password, displayName, role = "customer", categorySlug, location } = request.body ?? {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const name = typeof displayName === "string" ? displayName.trim() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return response.status(400).json({
      error: { code: "INVALID_EMAIL", message: "Enter a valid email address." }
    });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return response.status(400).json({
      error: { code: "INVALID_PASSWORD", message: "Password must be between 10 and 128 characters." }
    });
  }
  if (name.length < 2 || name.length > 100) {
    return response.status(400).json({
      error: { code: "INVALID_NAME", message: "Name must be between 2 and 100 characters." }
    });
  }
  if (!["customer", "entrepreneur"].includes(role)) {
    return response.status(400).json({
      error: { code: "INVALID_ROLE", message: "Choose customer or entrepreneur registration." }
    });
  }
  if (role === "entrepreneur" &&
      (typeof categorySlug !== "string" || typeof location !== "string" || !location.trim())) {
    return response.status(400).json({
      error: { code: "PROFILE_REQUIRED", message: "Entrepreneur registration requires a category and location." }
    });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    let categoryId;
    if (role === "entrepreneur") {
      const categoryResult = await client.query(
        "SELECT id FROM categories WHERE slug = $1 AND active = TRUE",
        [categorySlug]
      );
      if (!categoryResult.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(400).json({
          error: { code: "INVALID_CATEGORY", message: "Select an active marketplace category." }
        });
      }
      categoryId = categoryResult.rows[0].id;
    }

    const passwordHash = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name AS "displayName", role`,
      [normalizedEmail, name, passwordHash, role]
    );
    const user = userResult.rows[0];

    if (role === "entrepreneur") {
      await client.query(
        `INSERT INTO entrepreneur_profiles
           (user_id, display_name, location, category_id, verification_status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [user.id, name, location.trim(), categoryId]
      );
    }
    await createSession(user.id, response, client);
    await client.query("COMMIT");
    return response.status(201).json({ user });
  } catch (error) {
    await rollbackTransaction(client);
    if (error.code === "23505") {
      return response.status(409).json({
        error: { code: "EMAIL_EXISTS", message: "An account with this email already exists." }
      });
    }
    return next(error);
  } finally {
    client?.release();
  }
});

authRouter.post("/login", requireTrustedOrigin, loginLimit, async (request, response, next) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 128) {
    return response.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." }
    });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, email, display_name AS "displayName", role, password_hash
       FROM users
       WHERE email = $1 AND active = TRUE`,
      [email]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return response.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." }
      });
    }
    await createSession(user.id, response);
    delete user.password_hash;
    return response.json({ user });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/logout", requireTrustedOrigin, authenticate, async (request, response, next) => {
  const token = readSessionToken(request);
  try {
    if (token) {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash]);
    }
    clearSessionCookie(response);
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/me", authenticate, (request, response) => {
  response.json({ user: request.user ?? null });
});
