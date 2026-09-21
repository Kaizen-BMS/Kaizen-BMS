import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// The facility's current price list (self-pay prices) for the walk-in bill picker.
export const GET = apiRoute("bill:create", async () => {
  const rows = await tenantDb.tariffs.findMany({
    where: { active: true, effective_to: null, patient_category: "SELF_PAY", services: { active: true } },
    include: { services: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });
  const items = rows.map((t) => {
    const tax = Number(t.cgst_rate) + Number(t.sgst_rate) + Number(t.igst_rate);
    return { serviceId: Number(t.service_id), name: t.services.name, price: Number(t.price), taxPercent: tax, taxInclusive: !!t.tax_inclusive };
  });
  return json({ items });
});
