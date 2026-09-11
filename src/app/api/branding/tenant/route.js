import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  headerName: z.string().trim().min(1).max(191),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  qualifications: z.string().trim().max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  phone: z.string().trim().max(64).optional().or(z.literal("")),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  footerText: z.string().trim().max(500).optional().or(z.literal("")),
});

// The tenant's own branding — the default header on every printed document.
// For a solo tenant this IS the owner's personal practice branding.
export const PUT = apiRoute("branding:manage_tenant", async (request, { session }) => {
  const body = await parseBody(request, putSchema);

  const existing = await tenantDb.print_branding.findFirst({
    where: { scope: "TENANT" },
    select: { id: true },
  });
  const values = {
    header_name: body.headerName,
    logo_url: body.logoUrl || null,
    qualifications: body.qualifications || null,
    address: body.address || null,
    phone: body.phone || null,
    gstin: body.gstin || null,
    footer_text: body.footerText || null,
  };

  if (existing) {
    await tenantDb.print_branding.update({ where: { id: existing.id }, data: values });
  } else {
    await tenantDb.print_branding.create({ data: { scope: "TENANT", ...values } });
  }

  const tenantBranding = await tenantDb.print_branding.findFirst({ where: { scope: "TENANT" } });
  emitToTenant(session.tenantId, "branding:updated", { scope: "TENANT", branding: tenantBranding });
  return json({ tenantBranding });
});
