import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { insert, findOne, scopedQuery, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional().default(""),
});

const OPEN_STATUSES = ["REGISTERED", "WITH_DOCTOR", "PHARMACY", "LAB", "BILLING"];

// Today's visit board. `?status=` optional filter; default = all still-open.
export const GET = apiRoute("visit:read", async (request) => {
  const status = new URL(request.url).searchParams.get("status");
  const statuses =
    status && OPEN_STATUSES.includes(status) ? [status] : OPEN_STATUSES;
  const placeholders = statuses.map((_, i) => `:s${i}`).join(", ");
  const params = Object.fromEntries(statuses.map((s, i) => [`s${i}`, s]));
  const visits = await scopedQuery(
    `SELECT v.id, v.status, v.reason, v.created_at, v.updated_at,
            v.patient_id, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = :tid
        AND v.status IN (${placeholders})
        AND v.created_at >= CURDATE()
      ORDER BY v.created_at ASC`,
    params,
  );
  return json({ visits });
});

// Open a fresh visit for a patient already on file.
export const POST = apiRoute("visit:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const patient = await findOne("patients", { id: body.patientId }, "id, name, age, phone");
  if (!patient) return json({ error: "patient_not_found" }, 404);

  const tokenRow = await scopedQueryOne(
    `SELECT COUNT(*) AS n FROM visits WHERE tenant_id = :tid AND DATE(created_at) = CURDATE()`,
  );
  const visitId = await insert("visits", {
    patient_id: patient.id,
    status: "REGISTERED",
    entry_type: "OPD",
    token_number: Number(tokenRow.n) + 1,
    reason: body.reason || null,
    registered_by: session.userId,
  });

  const [visit] = await scopedQuery(
    `SELECT v.*, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone,
            p.allergies AS patient_allergies
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = :tid AND v.id = :id`,
    { id: visitId },
  );

  emitToTenant(session.tenantId, "visit:created", { visit });
  return json({ visit }, 201);
});
