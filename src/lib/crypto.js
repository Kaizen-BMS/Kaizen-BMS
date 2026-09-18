"use strict";

/**
 * AES-256-GCM encryption for external provider credentials at rest
 * (external_credentials.encrypted_secret) — the External Integration
 * Foundation's one genuinely new security surface (see the External
 * Integration Blueprint, Part 7: "credential storage is the one piece
 * with real security stakes"). Authenticated encryption (GCM's auth tag
 * detects tampering, not just decrypts) — never plain AES-CBC for
 * secrets. Key comes from `process.env.EXTERNAL_INTEGRATION_KEY`
 * (32 bytes, base64) — never hardcoded, never derived from anything else
 * already in this codebase (JWT_SECRET is for session signing, a
 * different trust boundary — reusing it here would mean rotating one
 * secret silently affects the other).
 */
const crypto = require("crypto");

const ALGO = "aes-256-gcm";

function getKey() {
  const raw = process.env.EXTERNAL_INTEGRATION_KEY;
  if (!raw) throw new Error("EXTERNAL_INTEGRATION_KEY is not set — see .env.example");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("EXTERNAL_INTEGRATION_KEY must decode to exactly 32 bytes (base64-encoded)");
  }
  return key;
}

/** Returns { ciphertext, iv, authTag } — each base64, ready to store in external_credentials. */
function encryptSecret(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM standard IV length
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/** Inverse of encryptSecret() — throws if the auth tag doesn't verify (tampered or wrong key). */
function decryptSecret({ ciphertext, iv, authTag }) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
  return plain.toString("utf8");
}

module.exports = { encryptSecret, decryptSecret };
