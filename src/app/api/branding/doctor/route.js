import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { getTenant } from "@/lib/tenants";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  headerName: z.string().trim().min(1).max(191),
  qualifications: z.string().trim().max(255).optional().or(z.literal("")),
});

// A staff doctor's personal branding — their name + qualifications layered
// on top of the hospital's header at the signature line. Only reachable
// (and only meaningful) when the hospital has switched this on; re-checked
// here server-side, not just hidden in the UI.
export const PUT = apiRoute("branding:manage_own", async (request, { session }) => {
  const tenant = await getTenant(session.tenantId);
  if (!tenant?.allow_doctor_branding) {
    throw new HttpError(403, "doctor_branding_not_enabled");
  }

  const body = await parseBody(request, putSchema);
  const tid = requireTenantId();

  await tenantDb.print_branding.upsert({
    where: {
      tenant_id_doctor_user_id: { tenant_id: BigInt(tid), doctor_user_id: BigInt(session.userId) },
    },
    update: { header_name: body.headerName, qualifications: body.qualifications || null },
    create: {
      scope: "DOCTOR",
      doctor_user_id: BigInt(session.userId),
      header_name: body.headerName,
      qualifications: body.qualifications || null,
    },
  });

  const ownBranding = await tenantDb.print_branding.findFirst({
    where: { scope: "DOCTOR", doctor_user_id: BigInt(session.userId) },
  });
  emitToTenant(session.tenantId, "branding:updated", { scope: "DOCTOR", branding: ownBranding });
  return json({ ownBranding });
});
