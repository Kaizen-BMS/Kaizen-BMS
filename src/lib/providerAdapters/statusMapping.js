"use strict";

/**
 * Provider status normalization — TASK 10 of the Real Vendor Integration
 * Readiness pass. No two real vendors are assumed to use the same status
 * vocabulary (one vendor's RECEIVED/PROCESSING/COMPLETED/CANCELLED/
 * REJECTED is another's ACCEPTED/IN_LAB/DONE/VOID) — the mapping table
 * lives on the provider's own `config.statusMap` (admin-configurable per
 * provider, see externalProviders.js's configSchema), never hardcoded in
 * adapter or business logic. Adding a real vendor never requires touching
 * this file — only setting its status map via the provider config API.
 */
const LAB_KAIZEN_STATUSES = ["ORDERED", "IN_PROGRESS", "RESULTED", "CANCELLED", "FAILED"];
const PHARMACY_KAIZEN_STATUSES = ["PENDING", "IN_PROGRESS", "DISPENSED", "CANCELLED", "FAILED"];

/**
 * `statusMap`: a plain `{ "VENDOR_STATUS": "KAIZEN_STATUS" }` object (case-
 * insensitive on the vendor-status side, since vendors are inconsistent
 * about casing). Returns `{ status, mapped }` — `mapped: false` means the
 * raw status had no entry in the configured map and `fallback` was used;
 * callers should treat that as worth logging/alerting on, never silently
 * trusted, since an unmapped status is a sign the vendor's config is
 * incomplete, not that Kaizen guessed correctly.
 */
function normalizeStatus(rawStatus, statusMap, fallback) {
  if (!rawStatus) return { status: fallback, mapped: false };
  const table = statusMap && typeof statusMap === "object" ? statusMap : {};
  const key = Object.keys(table).find((k) => k.toLowerCase() === String(rawStatus).toLowerCase());
  if (key) return { status: table[key], mapped: true };
  return { status: fallback, mapped: false };
}

module.exports = { LAB_KAIZEN_STATUSES, PHARMACY_KAIZEN_STATUSES, normalizeStatus };
