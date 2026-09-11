import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { findById, updateById, scopedQuery } from "@/lib/repo/tenant";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const STATUSES = [
  "REGISTERED",
  "WITH_DOCTOR",
  "PHARMACY",
  "LAB",
  "BILLING",
  "DISCHARGED",
  "CANCELLED",
];

const patchSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    followUpDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((b) => b.status || b.followUpDate !== undefined, {
    message: "nothing to update",
  });

export const PATCH = apiRoute("visit:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const visitId = Number(id);
  const body = await parseBody(request, patchSchema);

  const existing = await findById("visits", visitId, "id, status");
  if (!existing) return json({ error: "not_found" }, 404);

  const patch = {};
  if (body.status) patch.status = body.status;
  if (body.status === "DISCHARGED") patch.discharged_at = new Date();
  if (body.followUpDate !== undefined) patch.follow_up_date = body.followUpDate;

  await updateById("visits", visitId, patch);

  const [visit] = await scopedQuery(
    `SELECT v.*, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = :tid AND v.id = :id`,
    { id: visitId },
  );

  emitToTenant(ctx.session.tenantId, "visit:updated", { visit });
  return json({ visit });
});
