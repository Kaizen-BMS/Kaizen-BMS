import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional().default(""),
});

const OPEN_STATUSES = ["REGISTERED", "WITH_DOCTOR", "PHARMACY", "LAB", "BILLING"];

// Today's visit board. `?status=` optional filter; default = all still-open.
// Raw query (not the model API) — "today" and the JOIN's flattened columns
// need to match exactly what the client already relies on.
export const GET = apiRoute("visit:read", async (request) => {
  const status = new URL(request.url).searchParams.get("status");
  const statuses =
    status && OPEN_STATUSES.includes(status) ? [status] : OPEN_STATUSES;
  const tid = requireTenantId();
  const placeholders = statuses.map(() => "?").join(", ");
  const visits = await tenantDb.$queryRawUnsafe(
    `SELECT v.id, v.status, v.reason, v.created_at, v.updated_at,
            v.patient_id, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = ?
        AND v.status IN (${placeholders})
        AND v.created_at >= CURDATE()
      ORDER BY v.created_at ASC`,
    BigInt(tid),
    ...statuses,
  );
  return json({ visits });
});

// Open a fresh visit for a patient already on file.
export const POST = apiRoute("visit:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const patient = await tenantDb.patients.findUnique({
    where: { id: BigInt(body.patientId) },
    select: { id: true, name: true, age: true, phone: true },
  });
  if (!patient) return json({ error: "patient_not_found" }, 404);

  const tid = requireTenantId();
  const countRows = await tenantDb.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM visits WHERE tenant_id = ? AND DATE(created_at) = CURDATE()",
    BigInt(tid),
  );
  const tokenNumber = Number(countRows[0].n) + 1;

  const created = await tenantDb.visits.create({
    data: {
      patient_id: patient.id,
      status: "REGISTERED",
      entry_type: "OPD",
      token_number: tokenNumber,
      reason: body.reason || null,
      registered_by: BigInt(session.userId),
    },
    include: { patients: { select: { name: true, age: true, phone: true, allergies: true } } },
  });
  const { patients: p, ...rest } = created;
  const visit = {
    ...rest,
    patient_name: p.name,
    patient_age: p.age,
    patient_phone: p.phone,
    patient_allergies: p.allergies,
  };

  emitToTenant(session.tenantId, "visit:created", { visit });
  return json({ visit }, 201);
});
