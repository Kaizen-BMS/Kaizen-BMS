import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus, addBillLine } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { getTenant } from "@/lib/tenants";

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
    for (const it of body.items) await addBillLine(tx, { billId: b.id, item: it, defaultSource: source });
    await recomputeBillStatus(tx, b.id);
    return tx.bills.findUnique({ where: { id: b.id } });
  });
  emitToModule(session.tenantId, "BILLING", "bill:created", { bill });
  return json({ bill }, 201);
});
