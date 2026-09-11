"use strict";

const { queryOne } = require("./db");

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
    queryOne("SELECT name, allow_doctor_branding FROM tenants WHERE id = ? LIMIT 1", [tenantId]),
    queryOne(
      "SELECT * FROM print_branding WHERE tenant_id = ? AND scope = 'TENANT' LIMIT 1",
      [tenantId],
    ),
  ]);

  const header = brandingRow || {
    header_name: tenantRow?.name || "",
    logo_url: null,
    qualifications: null,
    address: null,
    phone: null,
    footer_text: null,
  };

  let signature = null;
  if (doctorUserId && tenantRow?.allow_doctor_branding) {
    const docRow = await queryOne(
      "SELECT header_name, qualifications FROM print_branding WHERE tenant_id = ? AND scope = 'DOCTOR' AND doctor_user_id = ? LIMIT 1",
      [tenantId, doctorUserId],
    );
    if (docRow) signature = { name: docRow.header_name, qualifications: docRow.qualifications };
  }

  return { header, signature };
}

module.exports = { resolveBranding };
