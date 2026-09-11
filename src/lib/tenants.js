"use strict";

const { queryOne } = require("./db");

const TENANT_TYPES = ["HOSPITAL", "DOCTOR_SOLO", "PHARMACY_SOLO", "LAB_SOLO"];

// Which single module a solo tenant type runs. HOSPITAL is null (any combo,
// controlled per-tenant via tenant_modules).
const SOLO_TYPE_MODULE = {
  DOCTOR_SOLO: "DOCTOR_OPD",
  PHARMACY_SOLO: "PHARMACY",
  LAB_SOLO: "LAB",
};

// The owner role each solo type provisions.
const SOLO_TYPE_OWNER_ROLE = {
  DOCTOR_SOLO: "OWNER_DOCTOR",
  PHARMACY_SOLO: "OWNER_PHARMACIST",
  LAB_SOLO: "OWNER_LAB_TECH",
};

const isSolo = (type) => type !== "HOSPITAL";

/** Load a tenant row, or null. */
async function getTenant(tenantId) {
  if (tenantId == null) return null;
  return queryOne(
    `SELECT id, name, slug, type, active, allow_doctor_branding
       FROM tenants WHERE id = ? LIMIT 1`,
    [tenantId],
  );
}

module.exports = {
  TENANT_TYPES,
  SOLO_TYPE_MODULE,
  SOLO_TYPE_OWNER_ROLE,
  isSolo,
  getTenant,
};
