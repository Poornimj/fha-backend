import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

async function hasExistingBaseline(client) {
  const result = await client.query(`
    SELECT
      to_regclass('public.users') IS NOT NULL
      AND to_regclass('public.products') IS NOT NULL
      AND to_regclass('public.orders') IS NOT NULL
      AND to_regclass('public.workshops') IS NOT NULL AS present
  `);

  return result.rows[0].present;
}

export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [72819341]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await fs.readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const existingBaseline = await hasExistingBaseline(client);

    for (const file of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [file],
      );

      if (alreadyApplied.rowCount > 0) continue;

      if (file === "001_baseline.sql" && existingBaseline) {
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        console.log(`Recognized existing database baseline: ${file}`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDirectory, file), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`Applied database migration: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Database migration failed (${file}): ${error.message}`, {
          cause: error,
        });
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [72819341]).catch(() => {});
    client.release();
  }
}
