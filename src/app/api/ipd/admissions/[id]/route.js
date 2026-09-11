import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule, emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

async function loadAdmission(id) {
  const tid = requireTenantId();
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT a.*, v.patient_id, v.reason AS visit_reason, b.ward_type, b.bed_number,
            p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone,
            p.allergies AS patient_allergies
       FROM admissions a
       JOIN visits v ON v.id = a.visit_id
       JOIN beds b ON b.id = a.bed_id
       JOIN patients p ON p.id = v.patient_id
      WHERE a.tenant_id = ? AND a.id = ?`,
    BigInt(tid),
    id,
  );
  const admission = rows[0];
  if (!admission) return null;
  admission.consent_forms = await tenantDb.consent_forms.findMany({
    where: { admission_id: id },
    orderBy: { id: "asc" },
  });
  const notes = await tenantDb.nursing_notes.findMany({
    where: { admission_id: id },
    orderBy: { id: "desc" },
    include: { users: { select: { name: true } } },
  });
  admission.nursing_notes = notes.map(({ users: u, ...rest }) => ({
    ...rest,
    author_name: u.name,
  }));
  return admission;
}

export const GET = apiRoute("admission:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const admission = await loadAdmission(BigInt(id));
  if (!admission) return json({ error: "not_found" }, 404);
  return json({ admission });
});

const dischargeSchema = z.object({
  dischargeType: z.enum(["ROUTINE", "TRANSFER", "AGAINST_MEDICAL_ADVICE", "DEATH"]),
  dischargeNotes: z.string().trim().max(2000).optional().default(""),
});

export const PATCH = apiRoute("admission:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const admissionId = BigInt(id);
  const admission = await tenantDb.admissions.findUnique({
    where: { id: admissionId },
    select: { id: true, visit_id: true, bed_id: true, discharged_at: true },
  });
  if (!admission) return json({ error: "not_found" }, 404);
  if (admission.discharged_at) return json({ error: "already_discharged" }, 409);

  const body = await parseBody(request, dischargeSchema);

  await tenantDb.$transaction(async (tx) => {
    await tx.admissions.update({
      where: { id: admissionId },
      data: {
        discharged_at: new Date(),
        discharge_type: body.dischargeType,
        discharge_notes: body.dischargeNotes || null,
      },
    });
    // Housekeeping needs to clean the bed before it's usable again.
    await tx.beds.update({ where: { id: admission.bed_id }, data: { status: "CLEANING" } });
    await tx.visits.update({ where: { id: admission.visit_id }, data: { status: "DISCHARGED" } });
  });

  const updated = await loadAdmission(admissionId);
  const bed = await tenantDb.beds.findUnique({ where: { id: admission.bed_id } });

  emitToModule(ctx.session.tenantId, "IPD", "admission:discharged", { admission: updated });
  emitToModule(ctx.session.tenantId, "IPD", "bed:updated", { bed });
  emitToTenant(ctx.session.tenantId, "visit:updated", {
    visit: { id: Number(admission.visit_id), status: "DISCHARGED" },
  });

  return json({ admission: updated });
});
