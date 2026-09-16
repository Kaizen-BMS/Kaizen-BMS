import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { matchAllergy } from "@/lib/allergyCheck";
import { writeOutboxEvent } from "@/lib/outbox";

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
        // Optional, explicit Service Master link (Phase 7 — CLAUDE.md
        // "Pricing / Tariff — pharmacy integration"). Never inferred from
        // medicineName text; omitted (every pre-Phase-7 caller) leaves this
        // item priced manually at checkout exactly as before. Purely a
        // pricing/billing concern — FEFO dispensing still matches by
        // medicine_name, completely unaffected by this field.
        serviceId: z.coerce.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const POST = apiRoute("prescription:create", async (request, ctx) => {
  const { session } = ctx;
  const { id } = await ctx.params;
  const consultationId = BigInt(id);
  const body = await parseBody(request, createSchema);

  const consultation = await tenantDb.consultations.findUnique({
    where: { id: consultationId },
    select: { id: true, visit_id: true, patient_id: true },
  });
  if (!consultation) return json({ error: "consultation_not_found" }, 404);

  const patient = await tenantDb.patients.findUnique({
    where: { id: consultation.patient_id },
    select: { allergies: true },
  });
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

  const { prescriptionId } = await tenantDb.$transaction(async (tx) => {
    const created = await tx.prescriptions.create({
      data: {
        visit_id: consultation.visit_id,
        consultation_id: consultationId,
        status: "PENDING",
        notes: body.notes || null,
        created_by: BigInt(session.userId),
      },
    });
    const ids = [];
    for (const it of body.items) {
      const item = await tx.prescription_items.create({
        data: {
          prescription_id: created.id,
          medicine_name: it.medicineName,
          dosage: it.dosage || null,
          quantity: it.quantity,
          service_id: it.serviceId ?? null,
        },
      });
      ids.push(item.id);
    }
    // Audit trail: who overrode which allergy warning, and when.
    for (let i = 0; i < body.items.length; i++) {
      if (matches[i] && body.items[i].allergyAck) {
        await tx.prescription_item_acks.create({
          data: {
            prescription_item_id: ids[i],
            warning: `Allergy match: ${matches[i]}`,
            acknowledged_by: BigInt(session.userId),
          },
        });
      }
    }
    // Durable event, same transaction as the prescription write — see
    // CLAUDE.md "Outbox — durable domain events". ID-first/minimal by
    // design: no medicine list, no diagnosis, no clinical notes. This is
    // NOT the realtime emit — emitToModule("prescription:created") below
    // stays exactly as it was, untouched, still zero-delay.
    await writeOutboxEvent(tx, {
      tenantId: session.tenantId,
      eventType: "PrescriptionCreated",
      aggregateType: "Prescription",
      aggregateId: created.id,
      payload: {
        prescriptionId: Number(created.id),
        patientId: Number(consultation.patient_id),
        visitId: consultation.visit_id != null ? Number(consultation.visit_id) : null,
        consultationId: Number(consultationId),
        createdBy: session.userId,
        itemCount: ids.length,
      },
    });

    return { prescriptionId: created.id, itemIds: ids };
  });

  const prescription = await tenantDb.prescriptions.findUnique({
    where: { id: prescriptionId },
    include: { prescription_items: { orderBy: { id: "asc" } } },
  });
  const { prescription_items, ...rest } = prescription;
  const out = { ...rest, items: prescription_items };

  // Routes to the Pharmacy sub-room live, in this same request cycle.
  emitToModule(session.tenantId, "PHARMACY", "prescription:created", { prescription: out });

  return json({ prescription: out }, 201);
});
