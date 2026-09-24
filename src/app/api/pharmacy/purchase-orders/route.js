import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { resolveInstance } from "@/lib/moduleInstances";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  freeQuantity: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  purchaseRate: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  gstRate: z.coerce.number().min(0).max(28).optional().default(0),
  notes: z.string().trim().max(255).optional().or(z.literal("")),
});
const createSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional(),
  poDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDeliveryDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  moduleInstanceId: z.coerce.number().int().positive().optional(),
  items: z.array(itemSchema).min(1).max(100),
});

function serialize(po) {
  return {
    id: Number(po.id), poNumber: po.po_number, poDate: po.po_date, status: po.status,
    supplierId: po.supplier_id != null ? Number(po.supplier_id) : null, supplierName: po.suppliers?.name || null,
    expectedDeliveryDate: po.expected_delivery_date, notes: po.notes, createdAt: po.created_at,
    items: (po.purchase_order_items || []).map((i) => ({
      id: Number(i.id), medicineId: Number(i.medicine_id), medicineName: i.medicines?.name || null,
      quantity: i.quantity, freeQuantity: i.free_quantity, purchaseRate: Number(i.purchase_rate),
      discountPercent: Number(i.discount_percent), gstRate: Number(i.gst_rate), receivedQuantity: i.received_quantity,
    })),
  };
}

// The step BEFORE stock physically arrives — what was ordered, from whom,
// and how much has been received against it so far. A GRN may optionally
// receive against one of these (see POST /api/pharmacy/grn); a GRN with no
// PO — the original, still fully supported path — just isn't linked to one.
export const GET = apiRoute("po:read", async (request) => {
  const status = new URL(request.url).searchParams.get("status");
  const rows = await tenantDb.purchase_orders.findMany({
    where: status ? { status } : {},
    orderBy: { created_at: "desc" },
    take: 60,
    include: { suppliers: { select: { name: true } }, purchase_order_items: { include: { medicines: { select: { name: true } } } } },
  });
  return json({ purchaseOrders: rows.map(serialize) });
});

export const POST = apiRoute("po:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", body.moduleInstanceId);
  const uid = BigInt(session.userId);

  const po = await tenantDb.$transaction(async (tx) => {
    const n = (await tx.purchase_orders.count()) + 1;
    let poNumber = `PO-${String(n).padStart(4, "0")}`;
    while (await tx.purchase_orders.findFirst({ where: { po_number: poNumber } })) {
      poNumber = `PO-${String(Number(poNumber.slice(3)) + 1).padStart(4, "0")}`;
    }
    const created = await tx.purchase_orders.create({
      data: {
        module_instance_id: instance.id, po_number: poNumber, po_date: new Date(body.poDate),
        supplier_id: body.supplierId ?? null, expected_delivery_date: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
        notes: body.notes || null, status: "SENT", created_by: uid,
      },
    });
    for (const it of body.items) {
      const medicine = await tx.medicines.findUnique({ where: { id: BigInt(it.medicineId) } });
      if (!medicine) throw new HttpError(400, `medicine_not_found:${it.medicineId}`);
      await tx.purchase_order_items.create({
        data: {
          po_id: created.id, medicine_id: medicine.id, quantity: it.quantity, free_quantity: it.freeQuantity,
          purchase_rate: it.purchaseRate, discount_percent: it.discountPercent, gst_rate: it.gstRate, notes: it.notes || null,
        },
      });
    }
    return created;
  });

  const full = await tenantDb.purchase_orders.findUnique({
    where: { id: po.id },
    include: { suppliers: { select: { name: true } }, purchase_order_items: { include: { medicines: { select: { name: true } } } } },
  });
  emitToModule(session.tenantId, "PHARMACY", "po:updated", { purchaseOrderId: Number(po.id) });
  return json({ purchaseOrder: serialize(full) }, 201);
});
