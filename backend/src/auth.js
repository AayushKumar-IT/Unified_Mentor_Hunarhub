import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { hashPassword, verifyPassword } from "./passwords.js";
const SESSION_COOKIE = "hunarhub_session";
const SESSION_DAYS = 14;

function cookieValue(request, name) {
  const cookieHeader = request.headers.cookie ?? "";
  const pair = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!pair) return "";
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return "";
  }
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  };
}

export async function createSession(userId, response, client = pool) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await client.query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))`,
    [userId, tokenHash, SESSION_DAYS]
  );
  response.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}

export function readSessionToken(request) {
  return cookieValue(request, SESSION_COOKIE);
}

export async function authenticate(request, _response, next) {
  const token = readSessionToken(request);
  if (!token) return next();

  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name AS "displayName", u.role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
      [tokenHash]
    );
    request.user = rows[0] ?? null;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user) {
      return response.status(401).json({
        error: { code: "AUTHENTICATION_REQUIRED", message: "Please sign in to continue." }
      });
    }
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({
        error: { code: "FORBIDDEN", message: "You do not have permission to do this." }
      });
    }
    return next();
  };
}

export function requireTrustedOrigin(request, response, next) {
  const origin = request.get("origin");
  const configuredOrigin = process.env.APP_ORIGIN;
  if (!configuredOrigin || !origin || origin !== configuredOrigin) {
    return response.status(403).json({
      error: { code: "UNTRUSTED_ORIGIN", message: "This request origin is not allowed." }
    });
  }
  return next();
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}
