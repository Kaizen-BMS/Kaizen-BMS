import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { billInfo } from "@/lib/labBills";

export const dynamic = "force-dynamic";

// Recent pharmacy-sourced bills — own screen, own gate (PHARMACY module),
// so a solo pharmacy (which never rents the separate BILLING module — see
// CLAUDE.md "Tenant types and packaging") can see its own sales without
// needing the tenant-wide Billing screen, same reasoning as Lab's own
// walk-in billing being self-contained in the Lab module.
export const GET = apiRoute("pharmacy:sell", async () => {
  const rows = await tenantDb.bill_items.findMany({
    where: { reference_type: "pharmacy_stock_movement" },
    select: { bill_id: true },
    distinct: ["bill_id"],
  });
  const billIds = [...new Set(rows.map((r) => r.bill_id))];
  const bills = billIds.length
    ? await tenantDb.bills.findMany({
        where: { id: { in: billIds } },
        include: { patients: { select: { name: true, phone: true } } },
        orderBy: { created_at: "desc" },
        take: 50,
      })
    : [];
  const infoMap = await billInfo(billIds);
  return json({
    sales: bills.map((b) => ({
      id: Number(b.id), customerName: b.patients?.name, phone: b.patients?.phone, createdAt: b.created_at,
      ...(infoMap.get(String(b.id)) || { status: b.status, total: Number(b.total_amount), due: 0 }),
    })),
  });
});
