import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Tenant-owned directory of staff who have no system login (sweepers, ward
// staff, etc.) — same "the system builds itself" philosophy as
// referral_sources: nothing pre-filled, a hospital adds its own. Their
// attendance is marked by a receptionist (see /api/attendance/proxy/*).
export const GET = apiRoute("staffmember:read", async (request) => {
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("all") === "1";
  const members = await tenantDb.staff_members.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return json({ members });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(191),
  designation: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
});

export const POST = apiRoute("staffmember:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const member = await tenantDb.staff_members.create({
    data: {
      name: body.name,
      designation: body.designation || null,
      phone: body.phone || null,
    },
  });
  emitToTenant(session.tenantId, "staffmember:created", { member });
  return json({ member }, 201);
});
