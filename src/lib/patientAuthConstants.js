"use strict";

// Deliberately a DIFFERENT cookie name from staff (SESSION_COOKIE in
// authConstants.js) — a patient session must never be readable as a staff
// session or vice versa, even by accident. 30 days: a consumer-facing
// portal shouldn't force a fresh OTP every 8 hours the way a staff shift
// session does.
const PATIENT_SESSION_COOKIE = "kaizen_patient_session";
const PATIENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 5 * 60;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

module.exports = {
  PATIENT_SESSION_COOKIE,
  PATIENT_SESSION_TTL_SECONDS,
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_VERIFY_ATTEMPTS,
};
