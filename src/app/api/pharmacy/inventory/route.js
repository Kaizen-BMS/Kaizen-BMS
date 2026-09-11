import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { EXPIRY_WARNING_DAYS } from "@/lib/pharmacyConstants";

export const dynamic = "force-dynamic";

// Batch-wise stock, grouped by medicine, with low-stock and expiry flags —
// the "current inventory view" + the alerts screen in one payload.
export const GET = apiRoute("stock:read", async () => {
  const [batches, thresholds] = await Promise.all([
    tenantDb.pharmacy_stock.findMany({
      orderBy: [{ medicine_name: "asc" }, { expiry_date: "asc" }, { id: "asc" }],
    }),
    tenantDb.pharmacy_thresholds.findMany({
      select: { medicine_name: true, low_stock_threshold: true },
    }),
  ]);

  const thresholdMap = new Map(thresholds.map((t) => [t.medicine_name, t.low_stock_threshold]));
  const warnBy = new Date();
  warnBy.setDate(warnBy.getDate() + EXPIRY_WARNING_DAYS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byMedicine = new Map();
  for (const b of batches) {
    const expiry = b.expiry_date ? new Date(b.expiry_date) : null;
    const flagged = {
      ...b,
      expired: !!expiry && expiry < today,
      expiringSoon: !!expiry && expiry >= today && expiry <= warnBy,
    };
    if (!byMedicine.has(b.medicine_name)) {
      byMedicine.set(b.medicine_name, {
        medicineName: b.medicine_name,
        totalQuantity: 0,
        threshold: thresholdMap.get(b.medicine_name) ?? 10,
        batches: [],
      });
    }
    const entry = byMedicine.get(b.medicine_name);
    entry.totalQuantity += b.quantity;
    entry.batches.push(flagged);
  }

  const medicines = [...byMedicine.values()]
    .map((m) => ({ ...m, lowStock: m.totalQuantity <= m.threshold }))
    .sort((a, b) => a.medicineName.localeCompare(b.medicineName));

  return json({ medicines });
});
