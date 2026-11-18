import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function rollbackTransaction(client) {
  if (!client) return;
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    console.error("Database rollback failed:", error);
  }
}
