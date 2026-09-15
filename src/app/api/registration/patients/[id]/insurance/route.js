import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { insuranceInputSchema, upsertPatientInsurance, serializeInsurance } from "@/lib/patientInsurance";

export const dynamic = "force-dynamic";

// Insurance details + payment category for a returning patient — its own
// endpoint, not folded into the narrow allergies/email PATCH on
// patients/[id], since this is a genuinely separate, larger data section
// (see CLAUDE.md "Insurance / payment" and patientInsurance.js).
export const GET = apiRoute("patient:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const patientId = BigInt(id);

  const patient = await tenantDb.patients.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) return json({ error: "not_found" }, 404);

  const row = await tenantDb.patient_insurance.findUnique({
    where: { patient_id: patientId },
  });
  return json({ insurance: serializeInsurance(row) });
});

export const PUT = apiRoute("patient:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const patientId = BigInt(id);

  const patient = await tenantDb.patients.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, insuranceInputSchema);
  const row = await upsertPatientInsurance(tenantDb, patientId, body, BigInt(ctx.session.userId));
  const insurance = serializeInsurance(row);

  emitToTenant(ctx.session.tenantId, "patient:updated", { patient: { id: Number(patientId), insurance } });
  return json({ insurance });
});
