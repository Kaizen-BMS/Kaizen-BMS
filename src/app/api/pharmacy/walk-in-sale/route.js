import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { resolveInstance } from "@/lib/moduleInstances";
import { recomputeBillStatus } from "@/lib/billing";
import { sellItems } from "@/lib/pharmacySale";
import { normalizeIndianPhone } from "@/lib/phone";
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
//
// Always opens a brand-new bill — to add more medicines to a customer's
// still-open bill later the same day (a "running" tab), use
// POST /api/pharmacy/sales/[billId]/items instead (found via
// GET /api/pharmacy/sales/open?phone=…), never a second bill for the same
// visit to the counter.
export const POST = apiRoute("pharmacy:sell", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const tid = requireTenantId();
  const uid = BigInt(session.userId);
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", body.moduleInstanceId);
  const rawPhone = body.phone || "";
  const phone = (rawPhone && normalizeIndianPhone(rawPhone)) || rawPhone || "walk-in";

  const out = await tenantDb.$transaction(async (tx) => {
    let patient = rawPhone ? await tx.patients.findFirst({ where: { phone, name: body.customerName } }) : null;
    if (!patient) patient = await tx.patients.create({ data: { name: body.customerName, age: 0, phone } });

    const bill = await tx.bills.create({ data: { patient_id: patient.id, bill_type: "OPD", created_by: uid } });
    await sellItems(tx, { tenantId: tid, instanceId: instance.id, billId: bill.id, items: body.items, performedBy: uid });
    await recomputeBillStatus(tx, bill.id);
    return { bill: await tx.bills.findUnique({ where: { id: bill.id } }), patient };
  });

  emitToModule(session.tenantId, "BILLING", "bill:created", { bill: out.bill });
  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { billId: Number(out.bill.id) });
  return json({ billId: Number(out.bill.id), total: Number(out.bill.total_amount) }, 201);
});
