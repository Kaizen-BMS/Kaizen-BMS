import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { resolveInstance } from "@/lib/moduleInstances";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const itemSchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  batchNumber: z.string().trim().min(1).max(80),
  manufacturingDate: dateStr.optional().or(z.literal("")),
  expiryDate: dateStr.optional().or(z.literal("")),
  receivedQuantity: z.coerce.number().int().min(0).max(1_000_000),
  freeQuantity: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  damagedQuantity: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  rejectedQuantity: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  purchaseRate: z.coerce.number().min(0).max(10_000_000),
  mrp: z.coerce.number().min(0).max(10_000_000),
  // What the pharmacy sells this batch for (worked out from margin in the UI); never above MRP.
  sellingRate: z.coerce.number().min(0).max(10_000_000).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  gstRate: z.coerce.number().min(0).max(28).optional().default(0),
});

const createSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional(),
  poId: z.coerce.number().int().positive().optional(),
  supplierInvoiceNumber: z.string().trim().max(80).optional().or(z.literal("")),
  supplierInvoiceDate: dateStr.optional().or(z.literal("")),
  grnDate: dateStr,
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  moduleInstanceId: z.coerce.number().int().positive().optional(),
  items: z.array(itemSchema).min(1).max(100),
});

// A goods receipt: stock physically arriving, per line. Only the ACCEPTED
// quantity (received + free − damaged − rejected) ever enters real,
// available inventory — a damaged/rejected unit is recorded (so the count
// is honest) but never added to stock. See CLAUDE.md "Pharmacy inventory".
export const POST = apiRoute("grn:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", body.moduleInstanceId);
  const uid = BigInt(session.userId);

  const grn = await tenantDb.$transaction(async (tx) => {
    const n = (await tx.grns.count()) + 1;
    let grnNumber = `GRN-${String(n).padStart(4, "0")}`;
    while (await tx.grns.findFirst({ where: { grn_number: grnNumber } })) {
      grnNumber = `GRN-${String(Number(grnNumber.slice(4)) + 1).padStart(4, "0")}`;
    }

    let po = null;
    if (body.poId) {
      po = await tx.purchase_orders.findUnique({ where: { id: BigInt(body.poId) }, include: { purchase_order_items: true } });
      if (!po) throw new HttpError(404, "purchase_order_not_found");
      if (!["SENT", "PARTIALLY_RECEIVED"].includes(po.status)) throw new HttpError(409, "purchase_order_not_receivable");
    }

    const created = await tx.grns.create({
      data: {
        module_instance_id: instance.id,
        grn_number: grnNumber,
        grn_date: new Date(body.grnDate),
        supplier_id: body.supplierId ?? (po?.supplier_id ?? null),
        po_id: po?.id ?? null,
        supplier_invoice_number: body.supplierInvoiceNumber || null,
        supplier_invoice_date: body.supplierInvoiceDate ? new Date(body.supplierInvoiceDate) : null,
        notes: body.notes || null,
        created_by: uid,
      },
    });

    for (const it of body.items) {
      const medicine = await tx.medicines.findUnique({ where: { id: BigInt(it.medicineId) } });
      if (!medicine) throw new HttpError(400, `medicine_not_found:${it.medicineId}`);
      const accepted = it.receivedQuantity + it.freeQuantity - it.damagedQuantity - it.rejectedQuantity;
      if (accepted < 0) throw new HttpError(400, "accepted_quantity_cannot_be_negative");
      if (it.mrp > 0 && it.sellingRate != null && it.sellingRate > it.mrp) throw new HttpError(400, "selling_price_above_mrp");

      let stockId = null;
      if (accepted > 0) {
        const existing = await tx.pharmacy_stock.findFirst({
          where: { medicine_name: medicine.name, batch_number: it.batchNumber, module_instance_id: instance.id },
          select: { id: true },
        });
        const rateFields = {
          purchase_rate: it.purchaseRate,
          mrp: it.mrp,
          ...(it.sellingRate != null ? { selling_rate: it.sellingRate } : {}),
          ...(it.expiryDate ? { expiry_date: new Date(it.expiryDate) } : {}),
          ...(it.manufacturingDate ? { manufacturing_date: new Date(it.manufacturingDate) } : {}),
          ...(body.supplierId ? { supplier_id: BigInt(body.supplierId) } : {}),
          grn_id: created.id,
          medicine_id: medicine.id,
        };
        if (existing) {
          stockId = existing.id;
          await tx.pharmacy_stock.update({ where: { id: stockId }, data: { quantity: { increment: accepted }, ...rateFields } });
        } else {
          const s = await tx.pharmacy_stock.create({
            data: { medicine_name: medicine.name, batch_number: it.batchNumber, quantity: accepted, module_instance_id: instance.id, ...rateFields },
          });
          stockId = s.id;
        }
        await tx.pharmacy_stock_movements.create({
          data: { stock_id: stockId, type: "IN", quantity_delta: accepted, performed_by: uid, reference_type: "GRN", reference_id: created.id },
        });
      }

      await tx.grn_items.create({
        data: {
          grn_id: created.id,
          medicine_id: medicine.id,
          batch_number: it.batchNumber,
          manufacturing_date: it.manufacturingDate ? new Date(it.manufacturingDate) : null,
          expiry_date: it.expiryDate ? new Date(it.expiryDate) : null,
          received_quantity: it.receivedQuantity,
          free_quantity: it.freeQuantity,
          damaged_quantity: it.damagedQuantity,
          purchase_rate: it.purchaseRate,
          mrp: it.mrp,
          discount_percent: it.discountPercent,
          gst_rate: it.gstRate,
          accepted_quantity: accepted,
          rejected_quantity: it.rejectedQuantity,
          stock_id: stockId,
        },
      });

      // Receiving against a real PO: credit whichever PO line ordered this
      // medicine (oldest not-yet-fully-received line first), then recompute
      // the PO's own status from every line's received-vs-ordered quantity.
      if (po) {
        const target = po.purchase_order_items.find((x) => String(x.medicine_id) === String(medicine.id) && x.received_quantity < x.quantity);
        if (target) {
          await tx.purchase_order_items.update({ where: { id: target.id }, data: { received_quantity: { increment: Math.min(it.receivedQuantity, target.quantity - target.received_quantity) } } });
          target.received_quantity += Math.min(it.receivedQuantity, target.quantity - target.received_quantity);
        }
      }
    }

    if (po) {
      const items = await tx.purchase_order_items.findMany({ where: { po_id: po.id } });
      const allReceived = items.every((i) => i.received_quantity >= i.quantity);
      const anyReceived = items.some((i) => i.received_quantity > 0);
      await tx.purchase_orders.update({ where: { id: po.id }, data: { status: allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status } });
    }

    return created;
  });

  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { grnId: Number(grn.id) });
  return json({ grnId: Number(grn.id), grnNumber: grn.grn_number }, 201);
});

export const GET = apiRoute("grn:read", async () => {
  const rows = await tenantDb.grns.findMany({
    orderBy: { created_at: "desc" },
    take: 60,
    include: { suppliers: { select: { name: true } }, grn_items: true },
  });
  return json({
    grns: rows.map((g) => ({
      id: Number(g.id),
      grnNumber: g.grn_number,
      grnDate: g.grn_date,
      supplierName: g.suppliers?.name || null,
      supplierInvoiceNumber: g.supplier_invoice_number,
      itemCount: g.grn_items.length,
      totalAccepted: g.grn_items.reduce((s, i) => s + i.accepted_quantity, 0),
    })),
  });
});
