"use strict";

// Env loaded by the caller (server.js / CLI scripts) or by Next — see db.js.
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { SESSION_TTL_SECONDS } = require("./authConstants");

// Roles that legitimately have tenant_id = NULL (not tied to one tenant).
// SUPER_ADMIN is the platform team; CONTENT_EDITOR is the one
// responsibility the blog CMS assigns — same "lives outside every tenant"
// shape, see rbac.js.
const PLATFORM_ROLES = new Set(["SUPER_ADMIN", "CONTENT_EDITOR"]);

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
function signSession({ userId, tenantId, role, homeTenantId }) {
  // `ht` = the user's own home tenant. Present only so a SWITCHED session
  // (tid !== ht, an organization owner acting in another owned facility) can
  // be re-verified against live ownership on every request — see orgAccess.js.
  const claims = { uid: userId, tid: tenantId ?? null, role };
  if (homeTenantId != null) claims.ht = homeTenantId;
  return jwt.sign(claims, getSecret(), {
    algorithm: "HS256",
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/**
 * Verify a session token → { userId, tenantId, role } | null.
 * tenantId is null only for a platform-level role (SUPER_ADMIN,
 * CONTENT_EDITOR — see PLATFORM_ROLES above); every other role must carry
 * one.
 */
async function verifySession(token) {
  try {
    const p = jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
    if (p.uid == null || !p.role) return null;
    const isPlatform = PLATFORM_ROLES.has(p.role);
    if (p.tid == null && !isPlatform) return null;
    return {
      userId: Number(p.uid),
      tenantId: p.tid == null ? null : Number(p.tid),
      role: p.role,
      homeTenantId: p.ht == null ? null : Number(p.ht),
    };
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signSession, verifySession };
