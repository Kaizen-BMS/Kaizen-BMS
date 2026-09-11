import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { insert, scopedQuery, scopedQueryOne } from "@/lib/repo/tenant";
import { validateCustomFields } from "@/lib/forms";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(191),
  age: z.coerce.number().int().min(0).max(150),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().or(z.literal("")),
  phone: z.string().trim().min(3).max(32),
  reason: z.string().trim().max(500).optional().default(""),
  allergies: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  abhaId: z.string().trim().max(64).optional().or(z.literal("")),
  customFields: z.record(z.string(), z.unknown()).optional(),
  openVisit: z.boolean().optional().default(true),
});

// Front-desk patient lookup (returning patients) — name or phone substring.
export const GET = apiRoute("patient:read", async (request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) return json({ patients: [] });
  const patients = await scopedQuery(
    `SELECT id, name, age, phone, custom_fields, allergies, abha_id, created_at
       FROM patients
      WHERE tenant_id = :tid AND (name LIKE :like OR phone LIKE :like)
      ORDER BY created_at DESC
      LIMIT 20`,
    { like: `%${q}%` },
  );
  return json({ patients });
});

// Register a new patient. Optionally opens a visit (queue entry) at once —
// the common front-desk flow. The visit gets today's next sequential
// per-tenant token number for the waiting-room display.
export const POST = apiRoute("patient:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const custom = await validateCustomFields(
    session.tenantId,
    "PATIENT_REGISTRATION",
    body.customFields,
  );

  const patientId = await insert("patients", {
    name: body.name,
    age: body.age,
    gender: body.gender || null,
    phone: body.phone,
    custom_fields: custom ? JSON.stringify(custom) : null,
    allergies: body.allergies?.length ? JSON.stringify(body.allergies) : null,
    abha_id: body.abhaId || null,
  });

  let visit = null;
  if (body.openVisit) {
    const tokenRow = await scopedQueryOne(
      `SELECT COUNT(*) AS n FROM visits WHERE tenant_id = :tid AND DATE(created_at) = CURDATE()`,
    );
    const visitId = await insert("visits", {
      patient_id: patientId,
      status: "REGISTERED",
      entry_type: "OPD",
      token_number: Number(tokenRow.n) + 1,
      reason: body.reason || null,
      registered_by: session.userId,
    });
    [visit] = await scopedQuery(
      `SELECT v.*, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone,
              p.allergies AS patient_allergies
         FROM visits v JOIN patients p ON p.id = v.patient_id
        WHERE v.tenant_id = :tid AND v.id = :id`,
      { id: visitId },
    );
    emitToTenant(session.tenantId, "visit:created", { visit });
  }

  const patient = {
    id: patientId,
    name: body.name,
    age: body.age,
    phone: body.phone,
    custom_fields: custom,
    allergies: body.allergies || [],
    abha_id: body.abhaId || null,
  };
  emitToTenant(session.tenantId, "patient:created", { patient });

  return json({ patient, visit }, 201);
});
