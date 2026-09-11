import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { query } from "@/lib/db";
import { requireTenantId, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  headerName: z.string().trim().min(1).max(191),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  qualifications: z.string().trim().max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  phone: z.string().trim().max(64).optional().or(z.literal("")),
  footerText: z.string().trim().max(500).optional().or(z.literal("")),
});

// The tenant's own branding — the default header on every printed document.
// For a solo tenant this IS the owner's personal practice branding.
export const PUT = apiRoute("branding:manage_tenant", async (request, { session }) => {
  const body = await parseBody(request, putSchema);
  const tid = requireTenantId();

  const existing = await scopedQueryOne(
    "SELECT id FROM print_branding WHERE tenant_id = :tid AND scope = 'TENANT' LIMIT 1",
  );
  const values = [
    body.headerName,
    body.logoUrl || null,
    body.qualifications || null,
    body.address || null,
    body.phone || null,
    body.footerText || null,
  ];

  if (existing) {
    await query(
      `UPDATE print_branding
          SET header_name = ?, logo_url = ?, qualifications = ?, address = ?, phone = ?, footer_text = ?
        WHERE id = ?`,
      [...values, existing.id],
    );
  } else {
    await query(
      `INSERT INTO print_branding
         (tenant_id, scope, header_name, logo_url, qualifications, address, phone, footer_text)
       VALUES (?, 'TENANT', ?, ?, ?, ?, ?, ?)`,
      [tid, ...values],
    );
  }

  const tenantBranding = await scopedQueryOne(
    "SELECT * FROM print_branding WHERE tenant_id = :tid AND scope = 'TENANT' LIMIT 1",
  );
  emitToTenant(session.tenantId, "branding:updated", { scope: "TENANT", branding: tenantBranding });
  return json({ tenantBranding });
});
