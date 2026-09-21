import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { hhmmToTimeValue } from "@/lib/appointments";

export const dynamic = "force-dynamic";

// A doctor's recurring weekly availability template. A DOCTOR sees/manages
// only their own; anyone with appointment:read (the booking desk) can list
// any doctor's via ?doctorId= to build the calendar/booking popover.
export const GET = apiRoute("appointment:read", async (request, { session }) => {
  const url = new URL(request.url);
  const doctorIdParam = url.searchParams.get("doctorId");
  const doctorId = doctorIdParam
    ? BigInt(doctorIdParam)
    : session.role === "DOCTOR" || session.role === "OWNER_DOCTOR"
      ? BigInt(session.userId)
      : null;

  const slots = await tenantDb.doctor_slots.findMany({
    where: doctorId ? { doctor_user_id: doctorId } : {},
    orderBy: [{ doctor_user_id: "asc" }, { day_of_week: "asc" }, { start_time: "asc" }],
  });
  return json({ slots });
});

const createSchema = z.object({
  // Admin / reception set availability FOR a doctor; a doctor always sets their own.
  doctorUserId: z.coerce.number().int().positive().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.coerce.number().int().min(5).max(240).optional().default(15),
});

// A doctor manages only their own template — doctor_user_id is always the
// caller, never client-supplied (same "manage_own" shape as branding).
export const POST = apiRoute("doctorslot:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  if (body.startTime >= body.endTime) {
    return json({ error: "endTime must be after startTime" }, 400);
  }

  let doctorId = BigInt(session.userId);
  if (body.doctorUserId && session.role !== "DOCTOR" && session.role !== "OWNER_DOCTOR") {
    const target = await prisma.users.findFirst({
      where: { id: BigInt(body.doctorUserId), tenant_id: BigInt(session.tenantId), role: { in: ["DOCTOR", "OWNER_DOCTOR"] } },
      select: { id: true },
    });
    if (!target) return json({ error: "doctor_not_found" }, 404);
    doctorId = target.id;
  }

  const slot = await tenantDb.doctor_slots.create({
    data: {
      doctor_user_id: doctorId,
      day_of_week: body.dayOfWeek,
      start_time: hhmmToTimeValue(body.startTime),
      end_time: hhmmToTimeValue(body.endTime),
      slot_minutes: body.slotMinutes,
    },
  });
  return json({ slot }, 201);
});
