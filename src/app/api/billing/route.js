import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// The billing counter's worklist: open/partial bills first, most recent
// first. `?status=` / `?type=` optional filters.
export const GET = apiRoute("bill:read", async (request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const billType = url.searchParams.get("type");

  const rows = await tenantDb.bills.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(billType ? { bill_type: billType } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 100,
    include: { patients: { select: { name: true, phone: true } } },
  });

  const bills = rows.map(({ patients: p, ...rest }) => ({
    ...rest,
    patient_name: p.name,
    patient_phone: p.phone,
  }));

  return json({ bills });
});
