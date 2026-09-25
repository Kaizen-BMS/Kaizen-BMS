import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { validateCustomFields } from "@/lib/forms";
import { emitToTenant } from "@/lib/realtime";
import { requireDoctor, doctorName, expectedTimeNow } from "@/lib/opdDoctors";
import { resolveTokenNumber, createVisitWithToken, logTokenOverride } from "@/lib/tokenOverride";
import { insuranceInputSchema, upsertPatientInsurance, serializeInsurance } from "@/lib/patientInsurance";
import { normalizeIndianPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(191),
  age: z.coerce.number().int().min(0).max(150),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().or(z.literal("")),
  // Normalized to a clean 10-digit form when it's a genuine Indian mobile number (what the
  // registration screen's own PhoneInput always sends); anything else — a landline, a foreign
  // number already in use somewhere — is kept as typed rather than rejected outright.
  phone: z.string().trim().min(3).max(32).transform((v) => normalizeIndianPhone(v) ?? v),
  // Optional — see forms.js's PATIENT_REGISTRATION core fields comment.
  email: z.string().trim().toLowerCase().email().max(191).optional().or(z.literal("")),
  reason: z.string().trim().max(500).optional().default(""),
  doctorId: z.coerce.number().int().positive().optional(),
  allergies: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  abhaId: z.string().trim().max(64).optional().or(z.literal("")),
  referralSourceId: z.coerce.number().int().positive().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  // Insurance details + payment category — see patientInsurance.js.
  insurance: insuranceInputSchema.optional(),
  openVisit: z.boolean().optional().default(true),
  // Receptionist manual token override — see registration/visits for the
  // same field pair on the "existing patient" path.
  manualToken: z.coerce.number().int().positive().optional(),
  overrideReason: z.string().trim().max(255).optional(),
});

// Front-desk patient lookup (returning patients) — name or phone substring.
export const GET = apiRoute("patient:read", async (request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) return json({ patients: [] });
  const rows = await tenantDb.patients.findMany({
    where: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
    select: {
      id: true,
      name: true,
      age: true,
      phone: true,
      email: true,
      custom_fields: true,
      allergies: true,
      abha_id: true,
      referral_source_id: true,
      referral_sources: { select: { name: true, type: true } },
      created_at: true,
    },
    orderBy: { created_at: "desc" },
    take: 20,
  });
  const patients = rows.map(({ referral_sources: rs, ...rest }) => ({
    ...rest,
    referral_source_name: rs?.name || null,
    referral_source_type: rs?.type || null,
  }));
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

  // Verify the source is this tenant's own before attaching it — the FK
  // alone only guarantees the id exists SOMEWHERE, not that it belongs to
  // this tenant (referral_sources has no unique-per-tenant id space).
  let referralSourceId = null;
  if (body.referralSourceId) {
    const source = await tenantDb.referral_sources.findUnique({
      where: { id: BigInt(body.referralSourceId) },
      select: { id: true },
    });
    if (!source) return json({ error: "referral_source_not_found" }, 400);
    referralSourceId = source.id;
  }

  const patientData = {
    name: body.name,
    age: body.age,
    gender: body.gender || null,
    phone: body.phone,
    email: body.email || null,
    custom_fields: custom ? JSON.stringify(custom) : null,
    allergies: body.allergies?.length ? JSON.stringify(body.allergies) : null,
    abha_id: body.abhaId || null,
    referral_source_id: referralSourceId,
  };

  const doctorId = await requireDoctor(session.tenantId, body.doctorId);
  const expected = await expectedTimeNow(session.tenantId, doctorId);
  let patient;
  let visit = null;
  let insuranceRow;

  if (body.openVisit) {
    // A losing token-override race now fails the visit-creation step for
    // real (migration 018's DB constraint) — patient creation and visit
    // creation must be one transaction, or a lost race leaves a brand-new
    // patient record orphaned with no visit. Found by actually testing the
    // override concurrency case, not assumed.
    const tid = requireTenantId();
    const result = await tenantDb.$transaction(async (tx) => {
      const p = await tx.patients.create({ data: patientData });
      const ins = await upsertPatientInsurance(tx, p.id, body.insurance, BigInt(session.userId));
      const { tokenNumber, overridden } = await resolveTokenNumber(tx, tid, session.role, {
        manualToken: body.manualToken,
        overrideReason: body.overrideReason,
        doctorId,
      });
      const created = await createVisitWithToken(
        tx,
        {
          patient_id: p.id,
          status: "REGISTERED",
          entry_type: "OPD",
          token_number: tokenNumber,
          reason: body.reason || null,
          doctor_id: doctorId,
          expected_time: expected,
          registered_by: BigInt(session.userId),
        },
        { patients: true },
      );
      if (overridden) {
        await logTokenOverride(tx, {
          visitId: created.id,
          tokenNumber,
          reason: body.overrideReason,
          overriddenBy: BigInt(session.userId),
        });
      }
      return { patient: p, visitRow: created, insuranceRow: ins };
    });
    patient = result.patient;
    visit = { ...flattenVisit(result.visitRow), doctor_name: await doctorName(session.tenantId, doctorId) };
    insuranceRow = result.insuranceRow;
    emitToTenant(session.tenantId, "visit:created", { visit });
  } else {
    patient = await tenantDb.patients.create({ data: patientData });
    insuranceRow = await upsertPatientInsurance(tenantDb, patient.id, body.insurance, BigInt(session.userId));
  }

  const patientOut = {
    id: Number(patient.id),
    name: body.name,
    age: body.age,
    phone: body.phone,
    email: body.email || null,
    custom_fields: custom,
    allergies: body.allergies || [],
    abha_id: body.abhaId || null,
    referral_source_id: referralSourceId ? Number(referralSourceId) : null,
    insurance: serializeInsurance(insuranceRow),
  };
  emitToTenant(session.tenantId, "patient:created", { patient: patientOut });

  return json({ patient: patientOut, visit }, 201);
});
