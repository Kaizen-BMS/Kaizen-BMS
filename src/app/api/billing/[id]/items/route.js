import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus, addBillLine } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { PATIENT_CATEGORIES } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const addItemSchema = z.object({
  serviceId: z.coerce.number().int().positive().optional(),
  // A manual line — a medicine/test with no catalog price, same "billing staff prices it by hand"
  // rule the walk-in bill's own creation step already follows (CLAUDE.md "Pharmacy/lab item amounts
  // start at 0 — no medicine/test price catalog"). Exactly one of serviceId or description+unitPrice.
  description: z.string().trim().max(255).optional(),
  unitPrice: z.coerce.number().min(0).max(10_000_000).optional(),
  quantity: z.coerce.number().positive().max(100_000).optional().default(1),
  patientCategory: z.enum(PATIENT_CATEGORIES).optional(),
  // How a manual line is categorized for revenue reports — only for a manual (non-serviceId) line;
  // a tariff-priced line is always source SERVICE regardless of what's sent here.
  source: z.enum(["PHARMACY", "LAB", "CONSULTATION"]).optional().default("CONSULTATION"),
});

// Add a line to a bill that's already open — a patient who steps out and comes back a couple of
// hours later for more medicine gets everything on the SAME bill (CLAUDE.md "Running / Combined
// Bill") instead of a fresh one each visit to the counter. Works on an OPEN or PARTIALLY_PAID bill;
// only a finalized one refuses further lines. Distinct from the existing auto-added CONSULTATION/
// PHARMACY/LAB/IPD_ROOM lines, which are untouched by this route.
export const POST = apiRoute("bill:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const billId = BigInt(id);

  const bill = await tenantDb.bills.findUnique({ where: { id: billId }, select: { id: true, patient_id: true, finalized_at: true } });
  if (!bill) return json({ error: "not_found" }, 404);
  if (bill.finalized_at) throw new HttpError(400, "bill_finalized");

  const body = await parseBody(request, addItemSchema);

  // Default to the patient's own payment category (CLAUDE.md "Insurance /
  // payment") when a tariff-priced line doesn't specify one.
  let defaultCategory = "SELF_PAY";
  if (body.serviceId && !body.patientCategory) {
    const insurance = await tenantDb.patient_insurance.findUnique({ where: { patient_id: bill.patient_id }, select: { payment_category: true } });
    defaultCategory = insurance?.payment_category || "SELF_PAY";
  }

  const result = await tenantDb.$transaction(async (tx) => {
    await addBillLine(tx, { billId, item: body, defaultSource: body.source, defaultCategory });
    await recomputeBillStatus(tx, billId);
    return tx.bills.findUnique({ where: { id: billId }, include: { bill_items: true } });
  });

  emitToModule(ctx.session.tenantId, "BILLING", "bill:updated", { bill: result });
  return json({ bill: result }, 201);
});
