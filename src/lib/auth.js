"use strict";

// Env loaded by the caller (server.js / CLI scripts) or by Next — see db.js.
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { SESSION_TTL_SECONDS } = require("./authConstants");

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET missing or too short — set it in .env");
  }
  return s;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/** Sign a session. Payload always carries userId + tenantId + role. */
function signSession({ userId, tenantId, role }) {
  return jwt.sign({ uid: userId, tid: tenantId ?? null, role }, getSecret(), {
    algorithm: "HS256",
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/**
 * Verify a session token → { userId, tenantId, role } | null.
 * tenantId is null only for SUPER_ADMIN (platform team, not tied to one
 * tenant); every other role must carry one.
 */
async function verifySession(token) {
  try {
    const p = jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
    if (p.uid == null || !p.role) return null;
    const isSuper = p.role === "SUPER_ADMIN";
    if (p.tid == null && !isSuper) return null;
    return {
      userId: Number(p.uid),
      tenantId: p.tid == null ? null : Number(p.tid),
      role: p.role,
    };
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signSession, verifySession };
