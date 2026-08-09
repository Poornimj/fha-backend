import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || "CUSTOMER",
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
    dateOfBirth: user.date_of_birth,
    preferredLanguage: user.preferred_language,
    accountType: user.account_type || "INDIVIDUAL",
    companyName: user.company_name,
    businessId: user.business_id,
    createdAt: user.created_at,
    role: user.role,
    emailVerifiedAt: user.email_verified_at,
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
      dateOfBirth = null,
      preferredLanguage = "English",
      accountType = "INDIVIDUAL",
      companyName = null,
      businessId = null,
      familyMembers = [],
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

    const normalizedAccountType = String(accountType || "INDIVIDUAL").trim().toUpperCase();
    if (!["INDIVIDUAL", "COMPANY"].includes(normalizedAccountType)) {
      return res.status(400).json({ message: "Choose a valid account type." });
    }
    if (normalizedAccountType === "COMPANY" && !String(companyName || "").trim()) {
      return res.status(400).json({ message: "Company or organization name is required." });
    }

    const normalizedBirthDate = dateOfBirth ? new Date(`${dateOfBirth}T00:00:00Z`) : null;
    if (normalizedAccountType === "INDIVIDUAL" && (!normalizedBirthDate || Number.isNaN(normalizedBirthDate.valueOf()) || normalizedBirthDate > new Date())) {
      return res.status(400).json({ message: "Enter a valid date of birth." });
    }
    if (normalizedBirthDate && (Number.isNaN(normalizedBirthDate.valueOf()) || normalizedBirthDate > new Date())) {
      return res.status(400).json({ message: "Enter a valid date of birth." });
    }
    const normalizedFamilyMembers = Array.isArray(familyMembers) ? familyMembers : [];
    for (const member of normalizedFamilyMembers) {
      const memberBirthDate = new Date(`${member.dateOfBirth}T00:00:00Z`);
      if (!String(member.firstName || "").trim() || !String(member.familyName || "").trim() || !String(member.relationship || "").trim()) {
        return res.status(400).json({ message: "Each family member needs a first name, family name, and relationship." });
      }
      if (!String(member.wellnessNotes || "").trim()) {
        return res.status(400).json({ message: "Wellness notes are required for each family member." });
      }
      if (Number.isNaN(memberBirthDate.valueOf()) || memberBirthDate > new Date()) {
        return res.status(400).json({ message: "Enter a valid date of birth for each family member." });
      }
      const memberAge = Math.floor((Date.now() - memberBirthDate.valueOf()) / 31557600000);
      if (memberAge < 18 && !member.guardianConfirmed) {
        return res.status(400).json({ message: "Parent or guardian confirmation is required for family members under 18." });
      }
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        first_name,
        family_name,
        phone,
        address,
        age,
        preferred_language,
        account_type,
        company_name,
        business_id,
        date_of_birth
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, email, first_name, family_name, phone, address, age, date_of_birth, preferred_language, account_type, company_name, business_id, role, email_verified_at, created_at`,
      [
        normalizedEmail,
        passwordHash,
        String(firstName).trim(),
        String(familyName).trim(),
        phone || null,
        address || null,
        age === "" || age === null ? null : Number(age),
        preferredLanguage,
        normalizedAccountType,
        normalizedAccountType === "COMPANY" ? String(companyName).trim() : null,
        normalizedAccountType === "COMPANY" ? String(businessId || "").trim() || null : null,
        dateOfBirth || null,
      ],
    );

    const user = result.rows[0];

      for (const member of normalizedFamilyMembers) {
        await client.query(
          `INSERT INTO family_members(user_id,first_name,family_name,relationship,date_of_birth,wellness_notes,guardian_confirmed)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [user.id, String(member.firstName).trim(), String(member.familyName).trim(), String(member.relationship).trim(), member.dateOfBirth, String(member.wellnessNotes).trim(), Boolean(member.guardianConfirmed)],
        );
      }
      await client.query("COMMIT");

      return res.status(201).json({ token: createToken(user), user: publicUser(user) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
      `SELECT id, email, password_hash, first_name, family_name, phone, address, age, date_of_birth, preferred_language, account_type, company_name, business_id, role, email_verified_at, created_at
       FROM users
       WHERE email = $1 AND is_active = true`,
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
      `SELECT id, email, first_name, family_name, phone, address, age, date_of_birth, preferred_language, account_type, company_name, business_id, role, email_verified_at, created_at
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

router.post("/logout", requireAuth, (_req, res) => res.status(204).end());

router.post("/forgot-password", async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    const user = await pool.query("SELECT id FROM users WHERE email = $1 AND is_active = true", [normalizedEmail]);
    let resetToken = null;
    if (user.rows[0]) {
      resetToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [user.rows[0].id, tokenHash],
      );
    }
    const response = { message: "If that account exists, password reset instructions have been prepared." };
    if (config.nodeEnv !== "production" && resetToken) response.resetToken = resetToken;
    res.json(response);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "That email address is already connected to another account." });
    next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    if (!token || password.length < 8) return res.status(400).json({ message: "A valid token and password of at least 8 characters are required." });
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [hash],
    );
    if (!found.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "This reset link is invalid or expired." });
    }
    await client.query("UPDATE users SET password_hash=$1 WHERE id=$2", [await bcrypt.hash(password, 12), found.rows[0].user_id]);
    await client.query("UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", [found.rows[0].user_id]);
    await client.query("COMMIT");
    res.json({ message: "Password updated successfully." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const fields = {
      email: req.body.email === undefined ? undefined : normalizeEmail(req.body.email),
      first_name: req.body.firstName,
      family_name: req.body.familyName,
      phone: req.body.phone,
      address: req.body.address,
      preferred_language: req.body.preferredLanguage,
      date_of_birth: req.body.dateOfBirth,
    };
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (req.body.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (!entries.length) return res.status(400).json({ message: "No profile changes supplied." });
    const values = entries.map(([, value]) => String(value ?? "").trim() || null);
    const sets = entries.map(([key], index) => `${key}=$${index + 1}`);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(", ")}, updated_at=now() WHERE id=$${values.length + 1}
       RETURNING id,email,first_name,family_name,phone,address,age,date_of_birth,preferred_language,account_type,company_name,business_id,role,email_verified_at,created_at`,
      [...values, req.user.id],
    );
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "That email address is already connected to another account." });
    next(error);
  }
});

export default router;
