import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
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
  const visitId = BigInt(id);
  const body = await parseBody(request, patchSchema);

  const existing = await tenantDb.visits.findUnique({
    where: { id: visitId },
    select: { id: true, status: true },
  });
  if (!existing) return json({ error: "not_found" }, 404);

  const patch = {};
  if (body.status) patch.status = body.status;
  if (body.status === "DISCHARGED") patch.discharged_at = new Date();
  if (body.followUpDate !== undefined) {
    patch.follow_up_date = body.followUpDate ? new Date(body.followUpDate) : null;
  }

  const updated = await tenantDb.visits.update({
    where: { id: visitId },
    data: patch,
    include: { patients: { select: { name: true, age: true, phone: true } } },
  });
  const { patients: p, ...rest } = updated;
  const visit = { ...rest, patient_name: p.name, patient_age: p.age, patient_phone: p.phone };

  emitToTenant(ctx.session.tenantId, "visit:updated", { visit });
  return json({ visit });
});
