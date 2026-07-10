import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      family_name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      age INTEGER CHECK (age IS NULL OR age >= 0),
      preferred_language TEXT NOT NULL DEFAULT 'English',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
