"use strict";

const { prisma } = require("./prismaClient");

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

/**
 * Load a tenant row, or null. Called before the tenant context exists (it's
 * what decides whether to grant one) — raw `prisma`, explicit tenantId.
 */
async function getTenant(tenantId) {
  if (tenantId == null) return null;
  return prisma.tenants.findUnique({
    where: { id: BigInt(tenantId) },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      active: true,
      owner_enabled: true,
      organization_id: true,
      public_code: true,
      allow_doctor_branding: true,
      created_at: true,
    },
  });
}

module.exports = {
  TENANT_TYPES,
  SOLO_TYPE_MODULE,
  SOLO_TYPE_OWNER_ROLE,
  isSolo,
  getTenant,
};
