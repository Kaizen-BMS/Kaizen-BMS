import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { transaction } from "@/lib/db";
import { requireTenantId, scopedQuery, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToTenant, emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Admit onto a specific (vacant) bed. Accepts an existing open visit, an
// existing patient (a fresh Direct Admission visit is opened for them), or
// a brand-new patient's details — whichever the bed-board's admit flow was
// started from.
const createSchema = z
  .object({
    bedId: z.coerce.number().int().positive(),
    reason: z.string().trim().max(500).optional().default(""),
    visitId: z.coerce.number().int().positive().optional(),
    patientId: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(191).optional(),
    age: z.coerce.number().int().min(0).max(150).optional(),
    phone: z.string().trim().min(3).max(32).optional(),
  })
  .refine((b) => b.visitId || b.patientId || (b.name && b.phone), {
    message: "provide visitId, patientId, or a new patient's name + phone",
  });

export const POST = apiRoute("admission:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const hid = requireTenantId();

  const bed = await scopedQueryOne("SELECT * FROM beds WHERE tenant_id = :tid AND id = :id", {
    id: body.bedId,
  });
  if (!bed) return json({ error: "bed_not_found" }, 404);
  if (bed.status !== "VACANT") throw new HttpError(409, "bed_not_vacant");

  const admissionId = await transaction(async (conn) => {
    let visitId = body.visitId;

    if (!visitId) {
      let patientId = body.patientId;
      if (!patientId) {
        const [pRes] = await conn.execute(
          "INSERT INTO patients (tenant_id, name, age, phone) VALUES (?, ?, ?, ?)",
          [hid, body.name, body.age ?? null, body.phone],
        );
        patientId = pRes.insertId;
      }
      const [vRes] = await conn.execute(
        `INSERT INTO visits (tenant_id, patient_id, entry_type, status, reason, registered_by)
         VALUES (?, ?, 'DIRECT_ADMISSION', 'ADMITTED', ?, ?)`,
        [hid, patientId, body.reason || null, session.userId],
      );
      visitId = vRes.insertId;
    } else {
      await conn.execute(
        "UPDATE visits SET status = 'ADMITTED' WHERE tenant_id = ? AND id = ?",
        [hid, visitId],
      );
    }

    const [aRes] = await conn.execute(
      `INSERT INTO admissions (tenant_id, visit_id, bed_id, admitted_by)
       VALUES (?, ?, ?, ?)`,
      [hid, visitId, body.bedId, session.userId],
    );
    await conn.execute("UPDATE beds SET status = 'OCCUPIED' WHERE tenant_id = ? AND id = ?", [
      hid,
      body.bedId,
    ]);
    return aRes.insertId;
  });

  const admission = await scopedQueryOne(
    `SELECT a.*, v.patient_id, p.name AS patient_name, p.age AS patient_age
       FROM admissions a
       JOIN visits v ON v.id = a.visit_id
       JOIN patients p ON p.id = v.patient_id
      WHERE a.tenant_id = :tid AND a.id = :id`,
    { id: admissionId },
  );
  const [bedNow] = await scopedQuery("SELECT * FROM beds WHERE tenant_id = :tid AND id = :id", {
    id: body.bedId,
  });

  emitToModule(session.tenantId, "IPD", "admission:created", { admission });
  emitToModule(session.tenantId, "IPD", "bed:updated", { bed: bedNow });
  emitToTenant(session.tenantId, "visit:updated", {
    visit: { id: admission.visit_id, status: "ADMITTED" },
  });

  return json({ admission }, 201);
});
