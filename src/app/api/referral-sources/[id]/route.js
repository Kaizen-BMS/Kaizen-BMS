import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const TYPES = ["RMP", "LOCAL_DOCTOR", "CAMP", "INSURANCE", "HEALTH_CARD", "OTHER"];

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    type: z.enum(TYPES).optional(),
    contactPhone: z.string().trim().max(64).optional().or(z.literal("")),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

// Never hard-deleted — a source referenced by existing patients must stay
// resolvable for their history. `active: false` retires it from the
// registration dropdown without breaking anything already recorded.
export const PATCH = apiRoute("referral:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const sourceId = BigInt(id);

  const existing = await tenantDb.referral_sources.findUnique({ where: { id: sourceId } });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const patch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.type !== undefined) patch.type = body.type;
  if (body.contactPhone !== undefined) patch.contact_phone = body.contactPhone || null;
  if (body.notes !== undefined) patch.notes = body.notes || null;
  if (body.active !== undefined) patch.active = body.active;

  const source = await tenantDb.referral_sources.update({ where: { id: sourceId }, data: patch });
  emitToTenant(ctx.session.tenantId, "referralsource:updated", { source });
  return json({ source });
});
