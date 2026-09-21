import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { resolveAndPriceService } from "@/lib/pricing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerName: z.string().trim().min(1).max(191),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  referredBy: z.string().trim().max(191).optional().or(z.literal("")),
  serviceIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
});

// A person walks in (or an outside doctor sent them): pick tests from the
// lab's own list -> the order is created AND the lab bills it itself, so the
// counter can take the money straight away. Doctor-ordered tests inside a
// hospital take the other road: they are billed at hospital billing.
export const POST = apiRoute("lab:walkin", async (request, { session }) => {
  const b = await parseBody(request, schema);
  const uid = BigInt(session.userId);
  const phone = b.phone || "walk-in";

  const out = await tenantDb.$transaction(async (tx) => {
    let patient = b.phone ? await tx.patients.findFirst({ where: { phone: b.phone, name: b.customerName } }) : null;
    if (!patient) patient = await tx.patients.create({ data: { name: b.customerName, age: b.age ?? 0, phone, ...(b.gender ? { gender: b.gender } : {}) } });

    const priced = [];
    for (const sid of b.serviceIds) {
      const r = await resolveAndPriceService(tx, sid, "SELF_PAY", 1);
      if (!r.ok) throw new HttpError(400, r.reason);
      priced.push(r);
    }

    const bill = await tx.bills.create({ data: { patient_id: patient.id, bill_type: "OPD", created_by: uid } });
    const order = await tx.lab_orders.create({
      data: { patient_id: patient.id, tests: JSON.stringify(priced.map((p) => p.service.name)), status: "ORDERED", ordered_by: uid, source: "WALK_IN", referred_by: b.referredBy || null, bill_id: bill.id },
    });
    for (const { service, tariff, line } of priced) {
      await tx.lab_order_items.create({ data: { lab_order_id: order.id, service_id: service.id, test_name: service.name } });
      await tx.bill_items.create({
        data: {
          bill_id: bill.id, source: "SERVICE", description: service.name, amount: line.amount, reference_type: "lab_order", reference_id: order.id,
          service_id: service.id, tariff_id: tariff.id, quantity: line.quantity, unit_price: line.unit_price, taxable_amount: line.taxable_amount,
          tax_rate: line.tax_rate, cgst_amount: line.cgst_amount, sgst_amount: line.sgst_amount, igst_amount: line.igst_amount, tax_amount: line.tax_amount,
        },
      });
    }
    await recomputeBillStatus(tx, bill.id);
    return { order, bill: await tx.bills.findUnique({ where: { id: bill.id } }), patient };
  });

  emitToModule(session.tenantId, "LAB", "laborder:created", { labOrder: { ...out.order, patient_name: out.patient.name } });
  emitToModule(session.tenantId, "BILLING", "bill:created", { bill: out.bill });
  return json({ orderId: Number(out.order.id), billId: Number(out.bill.id), total: Number(out.bill.total_amount) }, 201);
});
