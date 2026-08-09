import cors from "cors";
import express from "express";
import { config, validateConfig } from "./config.js";
import { initializeDatabase, pool } from "./db.js";
import authRoutes from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import cartRoutes from "./routes/cart.js";
import workflowRoutes from "./routes/workflows.js";
import orderRoutes from "./routes/orders.js";
import accountRoutes from "./routes/account.js";
import adminRoutes from "./routes/admin.js";

validateConfig();

const app = express();

const allowedOrigins = config.frontendOrigin.split(",").map((value) => value.trim());
const isLocalDevelopmentOrigin = (origin) => config.nodeEnv !== "production"
  && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
app.disable("x-powered-by");
app.use((_req,res,next)=>{
  res.set("X-Content-Type-Options","nosniff");
  res.set("X-Frame-Options","DENY");
  res.set("Referrer-Policy","strict-origin-when-cross-origin");
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin(origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api", workflowRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req,res)=>res.status(404).json({message:"API route not found."}));

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = Number(err.status) || (err.code === "23505" ? 409 : 500);
  res.status(status).json({
    message: status >= 500 ? "Something went wrong on the server." : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
});

async function start() {
  await initializeDatabase();

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Happy Drops backend running on port ${config.port}`);
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
