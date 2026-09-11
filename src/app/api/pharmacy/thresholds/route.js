import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { query } from "@/lib/db";
import { requireTenantId } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  medicineName: z.string().trim().min(1).max(191),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000),
});

// Set (or change) the low-stock alert threshold for one medicine.
export const PUT = apiRoute("stock:adjust", async (request, { session }) => {
  const body = await parseBody(request, putSchema);
  const tid = requireTenantId();

  await query(
    `INSERT INTO pharmacy_thresholds (tenant_id, medicine_name, low_stock_threshold)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE low_stock_threshold = VALUES(low_stock_threshold)`,
    [tid, body.medicineName, body.lowStockThreshold],
  );

  emitToModule(session.tenantId, "PHARMACY", "threshold:updated", {
    medicineName: body.medicineName,
    lowStockThreshold: body.lowStockThreshold,
  });
  return json({ medicineName: body.medicineName, lowStockThreshold: body.lowStockThreshold });
});
