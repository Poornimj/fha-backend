import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173",
  nodeEnv: process.env.NODE_ENV || "development",
  publicUrl: process.env.PUBLIC_URL || "http://127.0.0.1:4000",
};

export function validateConfig() {
  const missing = [];

  if (!config.databaseUrl) {
    missing.push("DATABASE_URL");
  }

  if (!config.jwtSecret) {
    missing.push("JWT_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
