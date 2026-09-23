import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { resolveInstance } from "@/lib/moduleInstances";
import { recomputeBillStatus } from "@/lib/billing";
import { priceLine } from "@/lib/pricing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({
  customerName: z.string().trim().min(1).max(191),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  items: z.array(z.object({ medicineId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(100_000) })).min(1).max(50),
  moduleInstanceId: z.coerce.number().int().positive().optional(),
});

// The counter-sale flow an independent (solo) pharmacy actually needs, and
// what an in-hospital pharmacy uses for an over-the-counter sale with no
// prescription: pick medicines -> FEFO across real batches -> price from
// each batch's own selling rate + the medicine's GST -> one bill (reusing
// the existing Billing engine, never a second one) -> stock genuinely
// deducted, in the same transaction as the bill. Prescription-based
// dispensing (POST /api/pharmacy/dispense/[itemId]) is completely
// untouched — this is the other, prescription-less road into the same
// stock + same billing system, matching CLAUDE.md's Lab walk-in precedent.
export const POST = apiRoute("pharmacy:sell", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const tid = requireTenantId();
  const uid = BigInt(session.userId);
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", body.moduleInstanceId);
  const phone = body.phone || "walk-in";

  const out = await tenantDb.$transaction(async (tx) => {
    let patient = body.phone ? await tx.patients.findFirst({ where: { phone: body.phone, name: body.customerName } }) : null;
    if (!patient) patient = await tx.patients.create({ data: { name: body.customerName, age: 0, phone } });

    const bill = await tx.bills.create({ data: { patient_id: patient.id, bill_type: "OPD", created_by: uid } });

    for (const line of body.items) {
      const medicine = await tx.medicines.findUnique({ where: { id: BigInt(line.medicineId) } });
      if (!medicine || !medicine.active) throw new HttpError(400, `medicine_unavailable:${line.medicineId}`);

      const batches = await tx.$queryRawUnsafe(
        `SELECT * FROM pharmacy_stock
          WHERE tenant_id = ? AND module_instance_id = ? AND medicine_id = ? AND quantity > 0
            AND (expiry_date IS NULL OR expiry_date >= CURDATE())
          ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, id ASC
          FOR UPDATE`,
        BigInt(tid),
        instance.id,
        medicine.id,
      );

      let remaining = line.quantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        if (take <= 0) continue;
        const rate = batch.selling_rate ?? batch.mrp;
        if (rate == null) throw new HttpError(400, `no_price_set:${medicine.name}`);

        const gst = Number(medicine.gst_rate || 0);
        const priced = priceLine({ price: Number(rate), tax_inclusive: false, cgst_rate: gst / 2, sgst_rate: gst / 2, igst_rate: 0 }, take);

        await tx.pharmacy_stock.update({ where: { id: batch.id }, data: { quantity: { decrement: take } } });
        const movement = await tx.pharmacy_stock_movements.create({
          data: { stock_id: batch.id, type: "DISPENSE", quantity_delta: -take, performed_by: uid, reference_type: "SALE", reference_id: bill.id },
        });
        await tx.bill_items.create({
          data: {
            bill_id: bill.id, source: "PHARMACY", description: `${medicine.name}${batch.batch_number ? ` (Batch ${batch.batch_number})` : ""}`,
            amount: priced.amount, quantity: priced.quantity, unit_price: priced.unit_price, taxable_amount: priced.taxable_amount,
            tax_rate: priced.tax_rate, cgst_amount: priced.cgst_amount, sgst_amount: priced.sgst_amount, igst_amount: priced.igst_amount, tax_amount: priced.tax_amount,
            reference_type: "pharmacy_stock_movement", reference_id: movement.id,
            stock_id: batch.id, medicine_id: medicine.id, batch_number: batch.batch_number, expiry_date: batch.expiry_date, mrp: batch.mrp, purchase_rate: batch.purchase_rate,
          },
        });
        remaining -= take;
      }
      if (remaining > 0) throw new HttpError(400, `insufficient_stock:${medicine.name}`);
    }

    await recomputeBillStatus(tx, bill.id);
    return { bill: await tx.bills.findUnique({ where: { id: bill.id } }), patient };
  });

  emitToModule(session.tenantId, "BILLING", "bill:created", { bill: out.bill });
  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { billId: Number(out.bill.id) });
  return json({ billId: Number(out.bill.id), total: Number(out.bill.total_amount) }, 201);
});
