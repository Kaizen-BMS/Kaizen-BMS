import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { detailsShape } from "@/lib/staffDetails";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    designation: z.string().trim().max(100).optional().or(z.literal("")),
    phone: z.string().trim().max(32).optional().or(z.literal("")),
    active: z.boolean().optional(),
    address: detailsShape.address,
    nativePlace: detailsShape.nativePlace,
    aadhaarNo: detailsShape.aadhaarNo,
    photoDataUrl: detailsShape.photoDataUrl,
  })
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

// Never hard-deleted — past attendance rows must stay resolvable to a name.
// `active: false` retires them from the proxy-marking roster.
export const PATCH = apiRoute("staffmember:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const memberId = BigInt(id);

  const existing = await tenantDb.staff_members.findUnique({ where: { id: memberId } });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const patch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.designation !== undefined) patch.designation = body.designation || null;
  if (body.phone !== undefined) patch.phone = body.phone || null;
  if (body.active !== undefined) patch.active = body.active;
  if (body.address !== undefined) patch.address = body.address || null;
  if (body.nativePlace !== undefined) patch.native_place = body.nativePlace || null;
  if (body.aadhaarNo !== undefined) patch.aadhaar_no = body.aadhaarNo ? body.aadhaarNo.replace(/\s+/g, "") : null;
  if (body.photoDataUrl !== undefined) patch.photo_url = body.photoDataUrl || null;

  const member = await tenantDb.staff_members.update({ where: { id: memberId }, data: patch });
  emitToTenant(ctx.session.tenantId, "staffmember:updated", { member });
  return json({ member });
});
