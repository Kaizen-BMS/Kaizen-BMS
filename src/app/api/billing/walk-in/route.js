import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { getTenant } from "@/lib/tenants";
import { findApplicableTariff, priceLine } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerName: z.string().trim().min(1).max(191),
  phone: z.string().trim().max(32).optional(),
  items: z
    .array(
      z.object({
        description: z.string().trim().max(255).optional().default(""),
        quantity: z.coerce.number().min(0.01).max(100000),
        unitPrice: z.coerce.number().min(0).max(10000000).optional(),
        // From the price list: the current tariff (with its GST) is used, not a typed price.
        serviceId: z.coerce.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(50),
});

// A walk-in bill for a solo pharmacy / lab / clinic (no visit needed): the
// customer is kept as a simple patient record, items are typed lines, and the
// normal payment / discount / receipt flow takes over from there.
export const POST = apiRoute("bill:create", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const tenant = await getTenant(session.tenantId);
  const source = tenant.type === "PHARMACY_SOLO" ? "PHARMACY" : tenant.type === "LAB_SOLO" ? "LAB" : "CONSULTATION";
  const phone = body.phone || "walk-in";

  const bill = await tenantDb.$transaction(async (tx) => {
    let patient = body.phone ? await tx.patients.findFirst({ where: { phone: body.phone, name: body.customerName } }) : null;
    if (!patient) patient = await tx.patients.create({ data: { name: body.customerName, age: 0, phone } });
    const b = await tx.bills.create({ data: { patient_id: patient.id, bill_type: "OPD", created_by: BigInt(session.userId) } });
    for (const it of body.items) {
      if (it.serviceId) {
        const service = await tx.services.findUnique({ where: { id: BigInt(it.serviceId) } });
        const tariff = service?.active ? await findApplicableTariff(tx, service.id, "SELF_PAY") : null;
        if (!tariff) throw new HttpError(400, "no_active_tariff");
        const line = priceLine(tariff, it.quantity);
        await tx.bill_items.create({
          data: {
            bill_id: b.id, source: "SERVICE", description: service.name, amount: line.amount, reference_type: "service", reference_id: service.id,
            service_id: service.id, tariff_id: tariff.id, quantity: line.quantity, unit_price: line.unit_price, taxable_amount: line.taxable_amount,
            tax_rate: line.tax_rate, cgst_amount: line.cgst_amount, sgst_amount: line.sgst_amount, igst_amount: line.igst_amount, tax_amount: line.tax_amount,
          },
        });
      } else {
        if (!it.description || it.unitPrice == null) throw new HttpError(400, "item_incomplete");
        await tx.bill_items.create({
          data: { bill_id: b.id, source, description: it.description, quantity: it.quantity, unit_price: it.unitPrice, amount: Math.round(it.quantity * it.unitPrice * 100) / 100 },
        });
      }
    }
    await recomputeBillStatus(tx, b.id);
    return tx.bills.findUnique({ where: { id: b.id } });
  });
  emitToModule(session.tenantId, "BILLING", "bill:created", { bill });
  return json({ bill }, 201);
});
