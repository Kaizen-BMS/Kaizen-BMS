import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

export const GET = apiRoute("bill:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const bill = await tenantDb.bills.findUnique({
    where: { id: BigInt(id) },
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
