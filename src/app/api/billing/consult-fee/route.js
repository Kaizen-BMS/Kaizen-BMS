import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({
  visitId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().max(1_000_000),
  mode: z.enum(["CASH", "CARD", "UPI"]),
});

// The front desk collects the doctor's consultation fee when the patient
// arrives: it goes on the visit's bill (created here if needed) and the
// payment is recorded at once. The doctor never handles the fee.
export const POST = apiRoute("fee:collect", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const visit = await tenantDb.visits.findUnique({ where: { id: BigInt(body.visitId) }, select: { id: true, patient_id: true } });
  if (!visit) throw new HttpError(404, "visit_not_found");

  const bill = await tenantDb.$transaction(async (tx) => {
    let b = await tx.bills.findFirst({ where: { visit_id: visit.id, bill_type: "OPD" } });
    if (b?.finalized_at) throw new HttpError(409, "bill_finalized");
    if (b) {
      const existing = await tx.bill_items.findFirst({ where: { bill_id: b.id, source: "CONSULTATION", reference_type: "reception_fee" } });
      if (existing) throw new HttpError(409, "fee_already_collected");
    } else {
      b = await tx.bills.create({ data: { patient_id: visit.patient_id, visit_id: visit.id, bill_type: "OPD", created_by: BigInt(session.userId) } });
    }
    await tx.bill_items.create({
      data: { bill_id: b.id, source: "CONSULTATION", description: "Consultation fee", quantity: 1, unit_price: body.amount, amount: body.amount, reference_type: "reception_fee" },
    });
    await tx.payments.create({ data: { bill_id: b.id, amount: body.amount, mode: body.mode, recorded_by: BigInt(session.userId) } });
    await recomputeBillStatus(tx, b.id);
    return tx.bills.findUnique({ where: { id: b.id } });
  });
  emitToModule(session.tenantId, "BILLING", "bill:updated", { bill });
  return json({ bill }, 201);
});
