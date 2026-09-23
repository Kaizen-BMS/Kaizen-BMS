import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// A pharmacy sale's own bill, in full (items/payments/discounts/refunds) —
// gated on the pharmacy action, not the tenant-wide bill:read (module-gated
// to BILLING, which a solo pharmacy tenant never rents). Same shape as
// GET /api/billing/[id] for anything that already knows how to render it.
export const GET = apiRoute("pharmacy:sell", async (_request, { params }) => {
  const { billId } = await params;
  const bill = await tenantDb.bills.findUnique({
    where: { id: BigInt(billId) },
    include: {
      patients: { select: { name: true, age: true, phone: true } },
      bill_items: { orderBy: { id: "asc" } },
      payments: { orderBy: { paid_at: "asc" } },
      discounts: { orderBy: { id: "asc" } },
      refunds: { orderBy: { id: "asc" } },
    },
  });
  if (!bill) return json({ error: "not_found" }, 404);
  const { patients: p, ...rest } = bill;
  return json({ bill: { ...rest, patient_name: p.name, patient_age: p.age, patient_phone: p.phone } });
});
