import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { getTenant } from "@/lib/tenants";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ allowDoctorBranding: z.boolean() });

// HOSPITAL_ADMIN-only switch: gives every staff doctor a personal branding
// screen (scope DOCTOR) layered on the hospital header. Off by default.
export const PATCH = apiRoute("branding:manage_tenant", async (request, { session }) => {
  const body = await parseBody(request, patchSchema);
  const tid = requireTenantId();

  await prisma.tenants.update({
    where: { id: BigInt(tid) },
    data: { allow_doctor_branding: body.allowDoctorBranding },
  });
  const tenant = await getTenant(tid);

  emitToTenant(session.tenantId, "tenant:updated", { tenant });
  return json({ tenant });
});
