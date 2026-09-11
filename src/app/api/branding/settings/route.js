import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { query } from "@/lib/db";
import { requireTenantId } from "@/lib/repo/tenant";
import { getTenant } from "@/lib/tenants";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ allowDoctorBranding: z.boolean() });

// HOSPITAL_ADMIN-only switch: gives every staff doctor a personal branding
// screen (scope DOCTOR) layered on the hospital header. Off by default.
export const PATCH = apiRoute("branding:manage_tenant", async (request, { session }) => {
  const body = await parseBody(request, patchSchema);
  const tid = requireTenantId();

  await query("UPDATE tenants SET allow_doctor_branding = ? WHERE id = ?", [
    body.allowDoctorBranding ? 1 : 0,
    tid,
  ]);
  const tenant = await getTenant(tid);

  emitToTenant(session.tenantId, "tenant:updated", { tenant });
  return json({ tenant });
});
