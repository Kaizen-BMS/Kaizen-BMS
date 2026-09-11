import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { insert, scopedQuery } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// The bed board's data: every bed, with the current admission's patient
// summary attached when occupied.
export const GET = apiRoute("bed:read", async () => {
  const beds = await scopedQuery(
    `SELECT b.*, a.id AS admission_id, a.visit_id, v.patient_id,
            p.name AS patient_name, p.age AS patient_age, a.admitted_at
       FROM beds b
       LEFT JOIN admissions a
              ON a.bed_id = b.id AND a.tenant_id = b.tenant_id AND a.discharged_at IS NULL
       LEFT JOIN visits v ON v.id = a.visit_id
       LEFT JOIN patients p ON p.id = v.patient_id
      WHERE b.tenant_id = :tid
      ORDER BY b.ward_type ASC, b.bed_number ASC`,
  );
  return json({ beds });
});

const createSchema = z.object({
  wardType: z.enum(["GENERAL", "PRIVATE", "ICU"]),
  bedNumber: z.string().trim().min(1).max(50),
});

// Add a bed to the master list.
export const POST = apiRoute("bed:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const bedId = await insert("beds", {
    ward_type: body.wardType,
    bed_number: body.bedNumber,
  });
  const [bed] = await scopedQuery("SELECT * FROM beds WHERE tenant_id = :tid AND id = :id", {
    id: bedId,
  });
  emitToModule(session.tenantId, "IPD", "bed:updated", { bed });
  return json({ bed }, 201);
});
