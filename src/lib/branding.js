"use strict";

const { prisma } = require("./prismaClient");

/**
 * Resolves what actually prints on a document for this tenant (and,
 * optionally, this doctor). See CLAUDE.md "Print branding".
 *
 *   header    — the tenant's own identity (name/logo/address/phone/footer).
 *               For a solo tenant this doubles as the practitioner's own
 *               branding — they edit it directly, there's no separate layer.
 *   signature — a DOCTOR-scope override (name + qualifications) layered on
 *               top of the header at the signature line, only when the
 *               hospital has allow_doctor_branding on AND that doctor has
 *               set up their own row. null otherwise — the caller falls back
 *               to the plain staff name.
 */
async function resolveBranding(tenantId, doctorUserId) {
  const [tenantRow, brandingRow] = await Promise.all([
    prisma.tenants.findUnique({
      where: { id: BigInt(tenantId) },
      select: { name: true, allow_doctor_branding: true },
    }),
    prisma.print_branding.findFirst({
      where: { tenant_id: BigInt(tenantId), scope: "TENANT" },
    }),
  ]);

  const header = brandingRow || {
    header_name: tenantRow?.name || "",
    logo_url: null,
    qualifications: null,
    address: null,
    phone: null,
    gstin: null,
    footer_text: null,
  };

  let signature = null;
  if (doctorUserId && tenantRow?.allow_doctor_branding) {
    const docRow = await prisma.print_branding.findFirst({
      where: { tenant_id: BigInt(tenantId), scope: "DOCTOR", doctor_user_id: BigInt(doctorUserId) },
      select: { header_name: true, qualifications: true },
    });
    if (docRow) signature = { name: docRow.header_name, qualifications: docRow.qualifications };
  }

  return { header, signature };
}

module.exports = { resolveBranding };
