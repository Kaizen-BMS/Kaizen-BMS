import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
});

// Status transitions. Cancelling reopens the slot for rebooking (the
// generated active_slot_time column frees it automatically); a no-show is
// recorded but does NOT reopen it — same rule as a genuinely different
// event from a clean cancellation (a no-show did happen at that time, the
// doctor was still committed to it).
export const PATCH = apiRoute("appointment:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const appointmentId = BigInt(id);

  const existing = await tenantDb.appointments.findUnique({ where: { id: appointmentId } });
  if (!existing) return json({ error: "not_found" }, 404);
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED" || existing.status === "NO_SHOW") {
    throw new HttpError(409, "already_finalized");
  }

  const body = await parseBody(request, patchSchema);
  const appointment = await tenantDb.appointments.update({
    where: { id: appointmentId },
    data: { status: body.status },
    include: { patients: { select: { name: true, age: true } } },
  });

  emitToModule(
    ctx.session.tenantId,
    "APPOINTMENTS",
    body.status === "CANCELLED" ? "appointment:cancelled" : "appointment:updated",
    { appointment },
  );
  return json({ appointment });
});
