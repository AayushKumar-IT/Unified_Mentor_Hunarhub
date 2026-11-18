import "dotenv/config";
import { pool } from "../db.js";
import { hashPassword } from "../passwords.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const displayName = process.env.ADMIN_NAME?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !displayName || displayName.length > 100 ||
    !password || password.length < 10 || password.length > 128) {
  console.error("Set ADMIN_EMAIL, ADMIN_NAME, and an ADMIN_PASSWORD (10–128 characters) before running this command.");
  process.exitCode = 1;
} else {
  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email`,
      [email, displayName, passwordHash]
    );
    console.log(`Created administrator account ${rows[0].email} (${rows[0].id}).`);
  } catch (error) {
    if (error.code === "23505") {
      console.error("An account with that email already exists; no changes were made.");
      process.exitCode = 1;
    } else {
      console.error("Administrator account creation failed.", error.message);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}
