import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Move an active admission to a different (vacant) bed — a real, common
// event (ICU -> general ward as a patient recovers), not covered by
// admit/discharge alone. Same clinical-decision weight as admit/discharge
// (action admission:update, DOCTOR territory — see CLAUDE.md "NURSE vs
// DOCTOR on IPD"), unlike day-to-day bed housekeeping (bed:manage).
const transferSchema = z.object({
  toBedId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(255),
});

export const POST = apiRoute("admission:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const admissionId = BigInt(id);
  const body = await parseBody(request, transferSchema);
  const toBedId = BigInt(body.toBedId);

  const admission = await tenantDb.admissions.findUnique({
    where: { id: admissionId },
    select: { id: true, bed_id: true, discharged_at: true },
  });
  if (!admission) return json({ error: "not_found" }, 404);
  if (admission.discharged_at) throw new HttpError(409, "already_discharged");
  if (admission.bed_id === toBedId) throw new HttpError(409, "same_bed");

  const toBed = await tenantDb.beds.findUnique({ where: { id: toBedId } });
  if (!toBed) return json({ error: "bed_not_found" }, 404);
  if (toBed.status !== "VACANT") throw new HttpError(409, "bed_not_vacant");

  const fromBedId = admission.bed_id;

  await tenantDb.$transaction(async (tx) => {
    await tx.beds.update({ where: { id: fromBedId }, data: { status: "CLEANING" } });
    await tx.beds.update({ where: { id: toBedId }, data: { status: "OCCUPIED" } });
    await tx.admissions.update({ where: { id: admissionId }, data: { bed_id: toBedId } });
    await tx.bed_transfers.create({
      data: {
        admission_id: admissionId,
        from_bed_id: fromBedId,
        to_bed_id: toBedId,
        reason: body.reason,
        transferred_by: BigInt(ctx.session.userId),
      },
    });
  });

  const [fromBedNow, toBedNow] = await Promise.all([
    tenantDb.beds.findUnique({ where: { id: fromBedId } }),
    tenantDb.beds.findUnique({ where: { id: toBedId } }),
  ]);

  emitToModule(ctx.session.tenantId, "IPD", "bed:updated", { bed: fromBedNow });
  emitToModule(ctx.session.tenantId, "IPD", "bed:updated", { bed: toBedNow });
  emitToModule(ctx.session.tenantId, "IPD", "admission:transferred", {
    admissionId: Number(admissionId),
    fromBedId: Number(fromBedId),
    toBedId: Number(toBedId),
  });

  return json({ fromBed: fromBedNow, toBed: toBedNow });
});
