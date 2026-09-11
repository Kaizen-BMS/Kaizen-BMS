import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
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
  const patients = await tenantDb.patients.findMany({
    where: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
    select: {
      id: true,
      name: true,
      age: true,
      phone: true,
      custom_fields: true,
      allergies: true,
      abha_id: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
    take: 20,
  });
  return json({ patients });
});

function flattenVisit(v) {
  const { patients: p, ...rest } = v;
  return {
    ...rest,
    patient_name: p.name,
    patient_age: p.age,
    patient_phone: p.phone,
    patient_allergies: p.allergies,
  };
}

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

  const patient = await tenantDb.patients.create({
    data: {
      name: body.name,
      age: body.age,
      gender: body.gender || null,
      phone: body.phone,
      custom_fields: custom ? JSON.stringify(custom) : null,
      allergies: body.allergies?.length ? JSON.stringify(body.allergies) : null,
      abha_id: body.abhaId || null,
    },
  });

  let visit = null;
  if (body.openVisit) {
    // DATE(created_at) = CURDATE() depends on the DB server's own clock —
    // keep this one query raw so "today" means exactly what it always has.
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
      include: { patients: true },
    });
    visit = flattenVisit(created);
    emitToTenant(session.tenantId, "visit:created", { visit });
  }

  const patientOut = {
    id: Number(patient.id),
    name: body.name,
    age: body.age,
    phone: body.phone,
    custom_fields: custom,
    allergies: body.allergies || [],
    abha_id: body.abhaId || null,
  };
  emitToTenant(session.tenantId, "patient:created", { patient: patientOut });

  return json({ patient: patientOut, visit }, 201);
});
