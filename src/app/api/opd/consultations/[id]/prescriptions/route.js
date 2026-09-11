import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { transaction } from "@/lib/db";
import { findById, requireTenantId, scopedQueryOne, scopedQuery } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";
import { matchAllergy } from "@/lib/allergyCheck";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  notes: z.string().trim().max(500).optional().default(""),
  items: z
    .array(
      z.object({
        medicineName: z.string().trim().min(1).max(191),
        dosage: z.string().trim().max(191).optional().default(""),
        quantity: z.coerce.number().int().min(1).max(9999),
        // Set only when the client showed an allergy-match warning for this
        // line and the doctor explicitly acknowledged it.
        allergyAck: z.boolean().optional().default(false),
      }),
    )
    .min(1)
    .max(50),
});

export const POST = apiRoute("prescription:create", async (request, ctx) => {
  const { session } = ctx;
  const { id } = await ctx.params;
  const consultationId = Number(id);
  const body = await parseBody(request, createSchema);

  const consultation = await findById("consultations", consultationId, "id, visit_id, patient_id");
  if (!consultation) return json({ error: "consultation_not_found" }, 404);

  const patient = await findById("patients", consultation.patient_id, "allergies");
  const allergies = Array.isArray(patient?.allergies)
    ? patient.allergies
    : typeof patient?.allergies === "string" && patient.allergies
      ? JSON.parse(patient.allergies)
      : [];

  // Re-check server-side — the client's warning is a UX convenience, never
  // the authority. Allergy-NAME matching only (see src/lib/allergyCheck.js);
  // this is deliberately not a full drug-interaction checker.
  const matches = body.items.map((it) => matchAllergy(it.medicineName, allergies));
  const unacknowledged = matches.findIndex((m, i) => m && !body.items[i].allergyAck);
  if (unacknowledged !== -1) {
    throw new HttpError(
      400,
      `"${body.items[unacknowledged].medicineName}" matches a declared allergy ` +
        `(${matches[unacknowledged]}) — acknowledge the warning before saving`,
    );
  }

  const hid = requireTenantId();
  const { prescriptionId } = await transaction(async (conn) => {
    const [res] = await conn.execute(
      `INSERT INTO prescriptions (tenant_id, visit_id, consultation_id, status, notes, created_by)
       VALUES (?, ?, ?, 'PENDING', ?, ?)`,
      [hid, consultation.visit_id, consultationId, body.notes || null, session.userId],
    );
    const pid = res.insertId;
    const ids = [];
    for (const it of body.items) {
      const [itemRes] = await conn.execute(
        `INSERT INTO prescription_items
           (tenant_id, prescription_id, medicine_name, dosage, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [hid, pid, it.medicineName, it.dosage || null, it.quantity],
      );
      ids.push(itemRes.insertId);
    }
    // Audit trail: who overrode which allergy warning, and when.
    for (let i = 0; i < body.items.length; i++) {
      if (matches[i] && body.items[i].allergyAck) {
        await conn.execute(
          `INSERT INTO prescription_item_acks
             (tenant_id, prescription_item_id, warning, acknowledged_by)
           VALUES (?, ?, ?, ?)`,
          [hid, ids[i], `Allergy match: ${matches[i]}`, session.userId],
        );
      }
    }
    return { prescriptionId: pid, itemIds: ids };
  });

  const prescription = await scopedQueryOne(
    `SELECT * FROM prescriptions WHERE tenant_id = :tid AND id = :id`,
    { id: prescriptionId },
  );
  prescription.items = await scopedQuery(
    `SELECT * FROM prescription_items WHERE tenant_id = :tid AND prescription_id = :id ORDER BY id ASC`,
    { id: prescriptionId },
  );

  // Routes to the Pharmacy sub-room live, in this same request cycle.
  emitToModule(session.tenantId, "PHARMACY", "prescription:created", { prescription });

  return json({ prescription }, 201);
});
