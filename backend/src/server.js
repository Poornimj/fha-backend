import cors from "cors";
import express from "express";
import { config, validateConfig } from "./config.js";
import { initializeDatabase, pool } from "./db.js";
import authRoutes from "./routes/auth.js";

validateConfig();

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server." });
});

async function start() {
  await initializeDatabase();

  app.listen(config.port, "127.0.0.1", () => {
    console.log(`Happy Drops backend running at http://127.0.0.1:${config.port}`);
  });
}

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
