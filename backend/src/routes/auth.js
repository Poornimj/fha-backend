import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    config.jwtSecret,
    { expiresIn: "7d" },
  );
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    familyName: user.family_name,
    phone: user.phone,
    address: user.address,
    age: user.age,
    preferredLanguage: user.preferred_language,
    createdAt: user.created_at,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

router.post("/signup", async (req, res, next) => {
  try {
    const {
      email,
      password,
      firstName,
      familyName,
      phone = null,
      address = null,
      age = null,
      preferredLanguage = "English",
    } = req.body;

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (!password || String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    if (!String(firstName || "").trim() || !String(familyName || "").trim()) {
      return res.status(400).json({ message: "First name and family name are required." });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);

    const result = await pool.query(
      `INSERT INTO users (
        email,
        password_hash,
        first_name,
        family_name,
        phone,
        address,
        age,
        preferred_language
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, email, first_name, family_name, phone, address, age, preferred_language, created_at`,
      [
        normalizedEmail,
        passwordHash,
        String(firstName).trim(),
        String(familyName).trim(),
        phone || null,
        address || null,
        age === "" || age === null ? null : Number(age),
        preferredLanguage,
      ],
    );

    const user = result.rows[0];

    return res.status(201).json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, family_name, phone, address, age, preferred_language, created_at
       FROM users
       WHERE email = $1`,
      [email],
    );

    const user = result.rows[0];
    const isValidPassword = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    return res.json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, first_name, family_name, phone, address, age, preferred_language, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

export default router;
