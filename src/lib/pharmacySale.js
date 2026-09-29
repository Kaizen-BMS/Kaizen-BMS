import { HttpError } from "@/lib/apiRoute";
import { priceLine } from "@/lib/pricing";
import { perContentUnitRate } from "@/lib/pharmacyPricing";

/**
 * Add priced, stock-deducting lines to a pharmacy bill — the one place a counter sale (a new bill)
 * and "add medicine to an existing bill" (a running/combined bill — see CLAUDE.md's pharmacy
 * simplify pass) both go through, so FEFO/pricing/ledger logic exists exactly once. Every batch
 * lock, price snapshot, and stock movement happens inside the caller's own transaction (`tx`).
 *
 * FEFO: batches are locked oldest-expiry-first (`FOR UPDATE`), and a single requested quantity can
 * span several batches — each batch contributes its own bill_item with its own MRP/purchase rate/
 * batch number, so a sale that draws from two batches always shows two priced lines, never one
 * line silently averaged across two different costs.
 *
 * Partial fulfillment, same as prescription dispensing: a cart of 2 medicines where only 1 is fully
 * in stock still bills and dispenses that 1 — it never aborts the whole sale over one short line.
 * Returns `{ lines, shortfalls }`; a line short by any amount is never silently dropped, it's
 * reported back so the counter can tell the customer and the pharmacist can decide what to do
 * (give a substitute, or leave the rest for later). `no_price_set`/`medicine_unavailable` stay hard
 * failures — those are data problems to fix in Inventory, not a stock shortfall to work around.
 */
export async function sellItems(tx, { tenantId, instanceId, billId, items, performedBy }) {
  const lines = [];
  const shortfalls = [];
  for (const line of items) {
    const medicine = await tx.medicines.findUnique({ where: { id: BigInt(line.medicineId) } });
    if (!medicine || !medicine.active) throw new HttpError(400, `medicine_unavailable:${line.medicineId}`);

    const batches = await tx.$queryRawUnsafe(
      `SELECT * FROM pharmacy_stock
        WHERE tenant_id = ? AND module_instance_id = ? AND medicine_id = ? AND quantity > 0
          AND (expiry_date IS NULL OR expiry_date >= CURDATE())
        ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, id ASC
        FOR UPDATE`,
      BigInt(tenantId),
      instanceId,
      medicine.id,
    );

    let remaining = line.quantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      if (take <= 0) continue;
      // batch.selling_rate/mrp are per PACK (Strip); `take` is a count of
      // the medicine's smallest CONTENT unit (Tablet) — see
      // pharmacyPricing.js's perContentUnitRate() for why this division
      // has to happen here, at the point of sale, every time.
      const rate = perContentUnitRate(batch.selling_rate ?? batch.mrp, medicine.content_per_pack);
      if (rate == null) throw new HttpError(400, `no_price_set:${medicine.name}`);

      const gst = Number(medicine.gst_rate || 0);
      const priced = priceLine({ price: rate, tax_inclusive: false, cgst_rate: gst / 2, sgst_rate: gst / 2, igst_rate: 0 }, take);

      await tx.pharmacy_stock.update({ where: { id: batch.id }, data: { quantity: { decrement: take } } });
      const movement = await tx.pharmacy_stock_movements.create({
        data: { stock_id: batch.id, type: "DISPENSE", quantity_delta: -take, performed_by: performedBy, reference_type: "SALE", reference_id: billId },
      });
      const item = await tx.bill_items.create({
        data: {
          bill_id: billId, source: "PHARMACY", description: `${medicine.name}${batch.batch_number ? ` (Batch ${batch.batch_number})` : ""}`,
          amount: priced.amount, quantity: priced.quantity, unit_price: priced.unit_price, taxable_amount: priced.taxable_amount,
          tax_rate: priced.tax_rate, cgst_amount: priced.cgst_amount, sgst_amount: priced.sgst_amount, igst_amount: priced.igst_amount, tax_amount: priced.tax_amount,
          reference_type: "pharmacy_stock_movement", reference_id: movement.id,
          stock_id: batch.id, medicine_id: medicine.id, batch_number: batch.batch_number, expiry_date: batch.expiry_date, mrp: batch.mrp, purchase_rate: batch.purchase_rate,
        },
      });
      lines.push(item);
      remaining -= take;
    }
    if (remaining > 0) {
      shortfalls.push({ medicineId: Number(medicine.id), medicineName: medicine.name, requested: line.quantity, sold: line.quantity - remaining, short: remaining });
    }
  }
  return { lines, shortfalls };
}
