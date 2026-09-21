import { apiRoute, json } from "@/lib/apiRoute";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { serializeProfile } from "@/lib/staffDetails";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["HOSPITAL_ADMIN", "DOCTOR", "NURSE", "PHARMACIST", "LAB_TECH", "BILLING_STAFF", "RECEPTIONIST", "RADIOLOGY_STAFF"];

// The staff directory: every login account at this tenant, left-joined
// with its optional staff_profiles row (join date/phone/designation —
// most staff won't have filled this in yet, that's fine). `users` is
// excluded from tenantDb's auto-scoping (tenant_id nullable there, for
// SUPER_ADMIN), so this filters explicitly, same as every other
// cross-cutting `users` lookup in this project.
export const GET = apiRoute("staff:manage", async (_request, { session }) => {
  const users = await prisma.users.findMany({
    where: { tenant_id: BigInt(session.tenantId), role: { in: STAFF_ROLES } },
    select: { id: true, name: true, email: true, role: true, created_at: true, active: true },
    orderBy: { name: "asc" },
  });

  const profiles = await tenantDb.staff_profiles.findMany({
    where: { user_id: { in: users.map((u) => u.id) } },
  });
  const byUser = new Map(profiles.map((p) => [String(p.user_id), p]));

  const staff = users.map((u) => {
    const p = byUser.get(String(u.id));
    return {
      userId: Number(u.id),
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active !== false,
      ...serializeProfile(p),
    };
  });
  return json({ staff });
});
