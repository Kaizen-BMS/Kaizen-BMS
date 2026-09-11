import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  visitId: z.coerce.number().int().positive(),
});

// OPD billing: created once, at checkout. Auto-populates line items from
// what already happened on this visit — the consultation fee (known
// exactly, from consultations.fee) and one line per dispensed pharmacy item
// / ordered lab test (description filled in, amount left at 0 for billing
// staff to price — there is no medicine/test price catalog in this system;
// see CLAUDE.md "Billing module"). Calling this twice for the same visit
// reuses the existing bill rather than creating a duplicate.
export const POST = apiRoute("bill:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const visitId = BigInt(body.visitId);

  const visit = await tenantDb.visits.findUnique({
    where: { id: visitId },
    select: { id: true, patient_id: true },
  });
  if (!visit) return json({ error: "visit_not_found" }, 404);

  const existing = await tenantDb.bills.findFirst({
    where: { visit_id: visitId, bill_type: "OPD" },
  });
  if (existing) return json({ bill: existing }, 200);

  const [consultations, prescriptionItemsAll, labOrders] = await Promise.all([
    tenantDb.consultations.findMany({ where: { visit_id: visitId } }),
    tenantDb.prescription_items.findMany({
      where: { prescriptions: { visit_id: visitId } },
    }),
    tenantDb.lab_orders.findMany({ where: { visit_id: visitId } }),
  ]);
  const prescriptionItems = prescriptionItemsAll.filter((it) => it.dispensed_quantity > 0);

  if (consultations.length === 0 && prescriptionItems.length === 0 && labOrders.length === 0) {
    throw new HttpError(400, "nothing to bill — no consultation, dispensed items, or lab orders on this visit yet");
  }

  const bill = await tenantDb.$transaction(async (tx) => {
    const created = await tx.bills.create({
      data: {
        patient_id: visit.patient_id,
        visit_id: visitId,
        bill_type: "OPD",
        created_by: BigInt(session.userId),
      },
    });

    for (const c of consultations) {
      await tx.bill_items.create({
        data: {
          bill_id: created.id,
          source: "CONSULTATION",
          description: "Consultation fee",
          amount: c.fee,
          reference_type: "consultation",
          reference_id: c.id,
        },
      });
    }
    for (const it of prescriptionItems) {
      await tx.bill_items.create({
        data: {
          bill_id: created.id,
          source: "PHARMACY",
          description: `${it.medicine_name} × ${it.dispensed_quantity}`,
          amount: 0,
          reference_type: "prescription_item",
          reference_id: it.id,
        },
      });
    }
    for (const lo of labOrders) {
      const tests = typeof lo.tests === "string" ? JSON.parse(lo.tests) : lo.tests || [];
      await tx.bill_items.create({
        data: {
          bill_id: created.id,
          source: "LAB",
          description: tests.join(", ") || "Lab tests",
          amount: 0,
          reference_type: "lab_order",
          reference_id: lo.id,
        },
      });
    }

    await recomputeBillStatus(tx, created.id);
    return tx.bills.findUnique({ where: { id: created.id }, include: { bill_items: true } });
  });

  emitToModule(session.tenantId, "BILLING", "bill:created", { bill });
  return json({ bill }, 201);
});
