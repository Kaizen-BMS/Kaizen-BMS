import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    status: z.enum(["VACANT", "CLEANING", "MAINTENANCE"]).optional(),
    dailyRate: z.coerce.number().min(0).max(1_000_000).optional(),
  })
  .refine((b) => b.status !== undefined || b.dailyRate !== undefined, { message: "nothing to update" });

// Manual housekeeping step: mark a bed CLEANING -> VACANT (ready for the next
// patient), or flag/clear MAINTENANCE. Never sets OCCUPIED here — that only
// happens as a side effect of admitting a patient. Also where the room's
// daily_rate (used to compute the IPD_ROOM billing item at discharge) is set.
export const PATCH = apiRoute("bed:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const bedId = BigInt(id);
  const bed = await tenantDb.beds.findUnique({ where: { id: bedId }, select: { id: true, status: true } });
  if (!bed) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  if (body.status && bed.status === "OCCUPIED") {
    return json({ error: "bed_occupied" }, 409);
  }

  const patch = {};
  if (body.status) patch.status = body.status;
  if (body.dailyRate !== undefined) patch.daily_rate = body.dailyRate;
  const updated = await tenantDb.beds.update({ where: { id: bedId }, data: patch });

  emitToModule(ctx.session.tenantId, "IPD", "bed:updated", { bed: updated });
  return json({ bed: updated });
});
