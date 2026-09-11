import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { findById, scopedQuery, scopedQueryOne, requireTenantId } from "@/lib/repo/tenant";
import { transaction } from "@/lib/db";
import { emitToModule, emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

async function loadAdmission(id) {
  const admission = await scopedQueryOne(
    `SELECT a.*, v.patient_id, v.reason AS visit_reason, b.ward_type, b.bed_number,
            p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone,
            p.allergies AS patient_allergies
       FROM admissions a
       JOIN visits v ON v.id = a.visit_id
       JOIN beds b ON b.id = a.bed_id
       JOIN patients p ON p.id = v.patient_id
      WHERE a.tenant_id = :tid AND a.id = :id`,
    { id },
  );
  if (!admission) return null;
  admission.consent_forms = await scopedQuery(
    "SELECT * FROM consent_forms WHERE tenant_id = :tid AND admission_id = :id ORDER BY id ASC",
    { id },
  );
  admission.nursing_notes = await scopedQuery(
    `SELECT n.*, u.name AS author_name FROM nursing_notes n
       JOIN users u ON u.id = n.author_user_id
      WHERE n.tenant_id = :tid AND n.admission_id = :id
      ORDER BY n.id DESC`,
    { id },
  );
  return admission;
}

export const GET = apiRoute("admission:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const admission = await loadAdmission(Number(id));
  if (!admission) return json({ error: "not_found" }, 404);
  return json({ admission });
});

const dischargeSchema = z.object({
  dischargeType: z.enum(["ROUTINE", "TRANSFER", "AGAINST_MEDICAL_ADVICE", "DEATH"]),
  dischargeNotes: z.string().trim().max(2000).optional().default(""),
});

export const PATCH = apiRoute("admission:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const admissionId = Number(id);
  const admission = await findById("admissions", admissionId, "id, visit_id, bed_id, discharged_at");
  if (!admission) return json({ error: "not_found" }, 404);
  if (admission.discharged_at) return json({ error: "already_discharged" }, 409);

  const body = await parseBody(request, dischargeSchema);
  const hid = requireTenantId();

  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE admissions
          SET discharged_at = CURRENT_TIMESTAMP(3), discharge_type = ?, discharge_notes = ?
        WHERE tenant_id = ? AND id = ?`,
      [body.dischargeType, body.dischargeNotes || null, hid, admissionId],
    );
    // Housekeeping needs to clean the bed before it's usable again.
    await conn.execute("UPDATE beds SET status = 'CLEANING' WHERE tenant_id = ? AND id = ?", [
      hid,
      admission.bed_id,
    ]);
    await conn.execute("UPDATE visits SET status = 'DISCHARGED' WHERE tenant_id = ? AND id = ?", [
      hid,
      admission.visit_id,
    ]);
  });

  const updated = await loadAdmission(admissionId);
  const [bed] = await scopedQuery("SELECT * FROM beds WHERE tenant_id = :tid AND id = :id", {
    id: admission.bed_id,
  });

  emitToModule(ctx.session.tenantId, "IPD", "admission:discharged", { admission: updated });
  emitToModule(ctx.session.tenantId, "IPD", "bed:updated", { bed });
  emitToTenant(ctx.session.tenantId, "visit:updated", {
    visit: { id: admission.visit_id, status: "DISCHARGED" },
  });

  return json({ admission: updated });
});
