import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { query } from "@/lib/db";
import { requireTenantId, scopedQueryOne } from "@/lib/repo/tenant";
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

  await query(
    `INSERT INTO print_branding (tenant_id, scope, doctor_user_id, header_name, qualifications)
     VALUES (?, 'DOCTOR', ?, ?, ?)
     ON DUPLICATE KEY UPDATE header_name = VALUES(header_name), qualifications = VALUES(qualifications)`,
    [tid, session.userId, body.headerName, body.qualifications || null],
  );

  const ownBranding = await scopedQueryOne(
    "SELECT * FROM print_branding WHERE tenant_id = :tid AND scope = 'DOCTOR' AND doctor_user_id = :uid LIMIT 1",
    { uid: session.userId },
  );
  emitToTenant(session.tenantId, "branding:updated", { scope: "DOCTOR", branding: ownBranding });
  return json({ ownBranding });
});
