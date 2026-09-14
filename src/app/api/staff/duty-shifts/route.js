import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// The duty roster for a date range — visible to every staff role
// (staffroster:read), not just admins: seeing who's scheduled when is
// ordinary shift-coordination information, unlike a leave reason.
export const GET = apiRoute("staffroster:read", async (request) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return json({ error: "from and to (YYYY-MM-DD) are required" }, 400);

  const tid = requireTenantId();
  const shifts = await tenantDb.$queryRawUnsafe(
    `SELECT s.id, s.user_id, s.shift_date, s.start_time, s.end_time, u.name AS user_name, u.role AS user_role
       FROM duty_shifts s JOIN users u ON u.id = s.user_id
      WHERE s.tenant_id = ? AND s.shift_date BETWEEN ? AND ?
      ORDER BY s.shift_date ASC, s.start_time ASC`,
    BigInt(tid),
    from,
    to,
  );
  return json({ shifts });
});

const createSchema = z.object({
  userId: z.coerce.number().int().positive(),
  shiftDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
});

// Assigning shifts is HOSPITAL_ADMIN's job — staff see the roster
// (staffroster:read above) but don't edit it.
export const POST = apiRoute("staff:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  if (body.startTime >= body.endTime) return json({ error: "endTime must be after startTime" }, 400);

  const user = await prisma.users.findFirst({
    where: { id: BigInt(body.userId), tenant_id: BigInt(session.tenantId) },
    select: { id: true },
  });
  if (!user) return json({ error: "user_not_found" }, 404);

  const shift = await tenantDb.duty_shifts.create({
    data: {
      user_id: user.id,
      shift_date: new Date(body.shiftDate),
      start_time: new Date(`1970-01-01T${body.startTime}:00.000Z`),
      end_time: new Date(`1970-01-01T${body.endTime}:00.000Z`),
      created_by: BigInt(session.userId),
    },
  });
  emitToTenant(session.tenantId, "dutyshift:created", { shift });
  return json({ shift }, 201);
});
