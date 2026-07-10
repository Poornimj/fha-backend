import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function requireAuth(req, res, next) {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
}
