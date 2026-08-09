import { initializeDatabase, pool } from "../db.js";
try {
  await initializeDatabase();
  console.log("Database is up to date.");
} finally {
  await pool.end();
}
