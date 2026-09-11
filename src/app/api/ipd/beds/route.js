import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// The bed board's data: every bed, with the current admission's patient
// summary attached when occupied.
export const GET = apiRoute("bed:read", async () => {
  const tid = requireTenantId();
  const beds = await tenantDb.$queryRawUnsafe(
    `SELECT b.*, a.id AS admission_id, a.visit_id, v.patient_id,
            p.name AS patient_name, p.age AS patient_age, a.admitted_at
       FROM beds b
       LEFT JOIN admissions a
              ON a.bed_id = b.id AND a.tenant_id = b.tenant_id AND a.discharged_at IS NULL
       LEFT JOIN visits v ON v.id = a.visit_id
       LEFT JOIN patients p ON p.id = v.patient_id
      WHERE b.tenant_id = ?
      ORDER BY b.ward_type ASC, b.bed_number ASC`,
    BigInt(tid),
  );
  return json({ beds });
});

const createSchema = z.object({
  wardType: z.enum(["GENERAL", "PRIVATE", "ICU"]),
  bedNumber: z.string().trim().min(1).max(50),
  dailyRate: z.coerce.number().min(0).max(1_000_000).optional().default(0),
});

// Add a bed to the master list.
export const POST = apiRoute("bed:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const bed = await tenantDb.beds.create({
    data: { ward_type: body.wardType, bed_number: body.bedNumber, daily_rate: body.dailyRate },
  });
  emitToModule(session.tenantId, "IPD", "bed:updated", { bed });
  return json({ bed }, 201);
});
