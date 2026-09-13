"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PATIENT_SESSION_TTL_SECONDS, OTP_LENGTH } = require("./patientAuthConstants");

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET missing or too short — set it in .env");
  }
  return s;
}

function generateOtp() {
  const max = 10 ** OTP_LENGTH;
  const n = Math.floor(Math.random() * max);
  return String(n).padStart(OTP_LENGTH, "0");
}

async function hashOtp(code) {
  return bcrypt.hash(code, 10);
}

async function verifyOtpHash(code, hash) {
  if (!hash) return false;
  return bcrypt.compare(code, hash);
}

/**
 * Sign a patient session. Payload shape is deliberately NOT staff-shaped
 * (`typ: "patient"`, `phone` instead of `uid`/`role`) so a patient token can
 * never verify as a staff session or vice versa — `verifySession()` (staff)
 * requires `uid`+`role` and would reject this outright; `verifyPatientSession`
 * requires `typ === "patient"` and rejects a staff token just as flatly.
 * Scoped to (tenantId, phone) rather than one patientId — the owner chose
 * per-tenant login, and multiple `patients` rows can legitimately share one
 * phone (family members registered under the same number); the session
 * grants access to all of them at THIS tenant, never another tenant's data.
 */
function signPatientSession({ tenantId, phone }) {
  return jwt.sign({ typ: "patient", tid: tenantId, phone }, getSecret(), {
    algorithm: "HS256",
    expiresIn: PATIENT_SESSION_TTL_SECONDS,
  });
}

async function verifyPatientSession(token) {
  try {
    const p = jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
    if (p.typ !== "patient" || p.tid == null || !p.phone) return null;
    return { tenantId: Number(p.tid), phone: String(p.phone) };
  } catch {
    return null;
  }
}

module.exports = { generateOtp, hashOtp, verifyOtpHash, signPatientSession, verifyPatientSession };
