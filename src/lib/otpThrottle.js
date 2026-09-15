"use strict";

const { OTP_RESEND_COOLDOWN_SECONDS } = require("./patientAuthConstants");

/**
 * In-memory, INPUT-keyed (tenantId+phone string) resend cooldown for OTP
 * requests — deliberately NOT driven by anything in the `patients` table.
 * If the cooldown were read from `patients.otp_requested_at` (a column
 * that only exists on a real patient row), rapid-fire re-requesting the
 * same phone would return `too_soon` only when the phone is actually
 * registered, and the generic "sent" message every single time otherwise
 * — an enumeration side channel just as real as a distinct error response
 * would be, just delayed to the second request instead of the first (see
 * CLAUDE.md "Patient Portal" for the email_send_failed case this was
 * found alongside). Marking/checking this per the raw input, before any
 * patient lookup happens, means the cooldown behaves identically whether
 * or not the phone turns out to be registered — same "keyed by the input,
 * not by whether a record exists" principle as rateLimit.js's staff-login
 * limiter, just a shorter, single-slot window instead of a counted one.
 *
 * Single process (custom server), so this is process-global and
 * sufficient — same acknowledged limitation as rateLimit.js; move to
 * Redis if this ever scales to >1 instance.
 */
const lastRequestAt = new Map(); // key -> timestamp ms

function checkOtpCooldown(key) {
  const last = lastRequestAt.get(key);
  if (!last) return { allowed: true };
  const elapsed = Date.now() - last;
  if (elapsed < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    return { allowed: false, retryAfter: Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000) };
  }
  return { allowed: true };
}

function markOtpRequested(key) {
  lastRequestAt.set(key, Date.now());
}

module.exports = { checkOtpCooldown, markOtpRequested };
