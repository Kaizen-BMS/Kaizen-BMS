import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { findApplicableTariff, priceLine, PATIENT_CATEGORIES } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const addItemSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().max(100_000).optional().default(1),
  patientCategory: z.enum(PATIENT_CATEGORIES).optional(),
});

// Add a priced, tariff-sourced line item to an OPEN bill — the direct
// Billing integration point for the Pricing/Tariff system (CLAUDE.md
// "Pricing / Tariff — billing integration"). Distinct from the existing
// auto-added CONSULTATION/PHARMACY/LAB/IPD_ROOM lines (those stay exactly
// as they were — an existing pharmacy/lab item with no matching Service in
// this catalog is still priced manually via the sibling
// PATCH .../items/[itemId] route, unchanged by this addition).
export const POST = apiRoute("bill:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const billId = BigInt(id);

  const bill = await tenantDb.bills.findUnique({ where: { id: billId }, select: { id: true, patient_id: true, finalized_at: true } });
  if (!bill) return json({ error: "not_found" }, 404);
  if (bill.finalized_at) throw new HttpError(400, "bill_finalized");

  const body = await parseBody(request, addItemSchema);
  const serviceId = BigInt(body.serviceId);

  const service = await tenantDb.services.findUnique({ where: { id: serviceId } });
  if (!service) return json({ error: "service_not_found" }, 404);
  if (!service.active) throw new HttpError(400, "service_inactive");

  // Default to the patient's own payment category (CLAUDE.md "Insurance /
  // payment") when the caller doesn't specify one — reuses data that
  // already exists rather than asking billing staff to re-enter it, while
  // still letting them override per-charge if this particular line should
  // be priced differently.
  let patientCategory = body.patientCategory;
  if (!patientCategory) {
    const insurance = await tenantDb.patient_insurance.findUnique({
      where: { patient_id: bill.patient_id },
      select: { payment_category: true },
    });
    patientCategory = insurance?.payment_category || "SELF_PAY";
  }

  const result = await tenantDb.$transaction(async (tx) => {
    const tariff = await findApplicableTariff(tx, serviceId, patientCategory);
    if (!tariff) {
      throw new HttpError(400, "no_active_tariff");
    }

    const line = priceLine(tariff, body.quantity);
    await tx.bill_items.create({
      data: {
        bill_id: billId,
        source: "SERVICE",
        description: service.name,
        amount: line.amount,
        reference_type: "service",
        reference_id: service.id,
        service_id: service.id,
        tariff_id: tariff.id,
        quantity: line.quantity,
        unit_price: line.unit_price,
        taxable_amount: line.taxable_amount,
        tax_rate: line.tax_rate,
        cgst_amount: line.cgst_amount,
        sgst_amount: line.sgst_amount,
        igst_amount: line.igst_amount,
        tax_amount: line.tax_amount,
      },
    });

    await recomputeBillStatus(tx, billId);
    return tx.bills.findUnique({ where: { id: billId }, include: { bill_items: true } });
  });

  emitToModule(ctx.session.tenantId, "BILLING", "bill:updated", { bill: result });
  return json({ bill: result }, 201);
});
