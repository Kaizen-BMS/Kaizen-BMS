"use strict";

/** Platform-side helpers for the owner/organization layer (raw prisma, cross-tenant by nature). */
const crypto = require("crypto");

const CODE_PREFIX = { HOSPITAL: "HOSPITAL", LAB_SOLO: "LAB", PHARMACY_SOLO: "PHARMACY" };

function candidateCode(type) {
  return `${CODE_PREFIX[type] || "CLINIC"}-KZ-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

/** Random public code, checked against existing ones (retry on collision). `db` may be a tx. */
async function uniquePublicCode(db, type) {
  for (let i = 0; i < 20; i++) {
    const code = candidateCode(type);
    const hit = await db.tenants.findFirst({ where: { public_code: code }, select: { id: true } });
    if (!hit) return code;
  }
  return `${CODE_PREFIX[type] || "CLINIC"}-KZ-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

module.exports = { uniquePublicCode };
