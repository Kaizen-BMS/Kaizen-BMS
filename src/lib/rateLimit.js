"use strict";

/**
 * In-memory sliding-window limiter for the login endpoint.
 * Keyed by lowercased email. Single process (custom server) so this is
 * process-global and sufficient; move to Redis if scaling to >1 instance.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const buckets = new Map(); // key -> number[] (attempt timestamps)

function loginRateCheck(email) {
  const key = String(email || "").toLowerCase();
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - hits[0])) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

function loginRateHit(email) {
  const key = String(email || "").toLowerCase();
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  buckets.set(key, hits);
}

function loginRateReset(email) {
  buckets.delete(String(email || "").toLowerCase());
}

module.exports = { loginRateCheck, loginRateHit, loginRateReset, MAX_ATTEMPTS };
