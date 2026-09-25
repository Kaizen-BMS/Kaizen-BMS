import { HttpError } from "@/lib/apiRoute";
import { priceLine } from "@/lib/pricing";

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
 */
export async function sellItems(tx, { tenantId, instanceId, billId, items, performedBy }) {
  const lines = [];
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
      const rate = batch.selling_rate ?? batch.mrp;
      if (rate == null) throw new HttpError(400, `no_price_set:${medicine.name}`);

      const gst = Number(medicine.gst_rate || 0);
      const priced = priceLine({ price: Number(rate), tax_inclusive: false, cgst_rate: gst / 2, sgst_rate: gst / 2, igst_rate: 0 }, take);

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
    if (remaining > 0) throw new HttpError(400, `insufficient_stock:${medicine.name}`);
  }
  return lines;
}
