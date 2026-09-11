import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { findById, updateById, scopedQuery } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["VACANT", "CLEANING", "MAINTENANCE"]),
});

// Manual housekeeping step: mark a bed CLEANING -> VACANT (ready for the next
// patient), or flag/clear MAINTENANCE. Never sets OCCUPIED here — that only
// happens as a side effect of admitting a patient.
export const PATCH = apiRoute("bed:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const bedId = Number(id);
  const bed = await findById("beds", bedId, "id, status");
  if (!bed) return json({ error: "not_found" }, 404);
  if (bed.status === "OCCUPIED") {
    return json({ error: "bed_occupied" }, 409);
  }

  const body = await parseBody(request, patchSchema);
  await updateById("beds", bedId, { status: body.status });
  const [updated] = await scopedQuery("SELECT * FROM beds WHERE tenant_id = :tid AND id = :id", {
    id: bedId,
  });

  emitToModule(ctx.session.tenantId, "IPD", "bed:updated", { bed: updated });
  return json({ bed: updated });
});
