import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

// Approve/reject — HOSPITAL_ADMIN only, never the requester themselves
// (staff:manage isn't granted to plain staff roles at all, so this is
// already impossible for anyone but an admin to call).
export const PATCH = apiRoute("staff:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const requestId = BigInt(id);

  const existing = await tenantDb.leave_requests.findUnique({ where: { id: requestId } });
  if (!existing) return json({ error: "not_found" }, 404);
  if (existing.status !== "PENDING") throw new HttpError(409, "already_decided");

  const body = await parseBody(request, patchSchema);
  const leaveRequest = await tenantDb.leave_requests.update({
    where: { id: requestId },
    data: { status: body.status, approved_by: BigInt(ctx.session.userId), decided_at: new Date() },
  });

  emitToTenant(ctx.session.tenantId, "leaverequest:updated", { leaveRequest });
  return json({ leaveRequest });
});
