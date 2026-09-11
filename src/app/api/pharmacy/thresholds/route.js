import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
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

  await tenantDb.pharmacy_thresholds.upsert({
    where: {
      tenant_id_medicine_name: { tenant_id: BigInt(tid), medicine_name: body.medicineName },
    },
    update: { low_stock_threshold: body.lowStockThreshold },
    create: { medicine_name: body.medicineName, low_stock_threshold: body.lowStockThreshold },
  });

  emitToModule(session.tenantId, "PHARMACY", "threshold:updated", {
    medicineName: body.medicineName,
    lowStockThreshold: body.lowStockThreshold,
  });
  return json({ medicineName: body.medicineName, lowStockThreshold: body.lowStockThreshold });
});
