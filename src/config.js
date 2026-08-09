import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173",
  nodeEnv: process.env.NODE_ENV || "development",
  publicUrl: process.env.PUBLIC_URL || "http://127.0.0.1:4000",
  frontendUrl: process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173",
  openai: {
    enabled: String(process.env.OPENAI_ENABLED || "false").toLowerCase() === "true",
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
  },
  reviewRecipients: (process.env.WELLNESS_REVIEW_RECIPIENTS || "jianxinfang25@gmail.com,suvi@happinessacademy.fi")
    .split(",").map((value) => value.trim()).filter(Boolean),
  mail: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.MAIL_FROM || "Happy Drops <no-reply@happydrops.com>",
  },
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
