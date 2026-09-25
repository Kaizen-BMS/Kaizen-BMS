import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { hashPassword } from "@/lib/auth";
import { tempPassword } from "@/lib/passwordReset";
import { allowedRoles } from "@/lib/staffRoles";
import { getTenant } from "@/lib/tenants";
import { detailsShape, toProfileData } from "@/lib/staffDetails";
import { applyDutyFromProfile, logHistory } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

async function context(session) {
  const tenant = await getTenant(session.tenantId);
  const mods = await prisma.tenant_modules.findMany({ where: { tenant_id: BigInt(session.tenantId), is_active: true }, select: { module_name: true } });
  return { tenant, roles: allowedRoles(tenant.type, mods.map((m) => m.module_name)) };
}

// Login accounts of THIS facility, plus the roles it may create (only roles
// whose module the facility actually has).
export const GET = apiRoute("staff:manage", async (request, { session }) => {
  const { roles } = await context(session);
  const users = await prisma.users.findMany({
    where: { tenant_id: BigInt(session.tenantId) },
    select: { id: true, name: true, email: true, role: true, created_at: true },
    orderBy: { name: "asc" },
  });
  return json({ roles, accounts: users.map((u) => ({ id: Number(u.id), name: u.name, email: u.email, role: u.role, createdAt: u.created_at })) });
});

const schema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.string().trim().toLowerCase().email().max(191),
  role: z.string().max(40),
  password: z.string().min(8).max(200).optional(),
  // Which days of the week (0=Sun..6=Sat) the duty hours below apply to — set once, here, instead of
  // a separate trip to the Duty Roster's weekly-schedule screen just to pick working days.
  workDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
  ...detailsShape,
});

/** The next free "EMP-###" for this tenant — used whenever the admin leaves Employee ID blank. */
async function nextEmployeeId(tenantId) {
  const tid = BigInt(tenantId);
  const n = (await prisma.staff_profiles.count({ where: { tenant_id: tid } })) + 1;
  let id = `EMP-${String(n).padStart(3, "0")}`;
  let bump = n;
  while (await prisma.staff_profiles.findFirst({ where: { tenant_id: tid, employee_id: id }, select: { id: true } })) {
    bump += 1;
    id = `EMP-${String(bump).padStart(3, "0")}`;
  }
  return id;
}

// The admin/owner creates a login for one of their people: name, email, role
// and a password they set (or leave blank to get a generated one, shown once).
export const POST = apiRoute("staff:manage", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const { roles } = await context(session);
  if (!roles.some((r) => r.role === body.role)) throw new HttpError(422, "role_not_available");
  // Login is by email, so an email may exist only once across the platform.
  if (await prisma.users.findFirst({ where: { email: body.email }, select: { id: true } })) throw new HttpError(409, "email_taken");
  const pw = body.password || tempPassword();
  const user = await prisma.users.create({
    data: { tenant_id: BigInt(session.tenantId), name: body.name, email: body.email, password_hash: await hashPassword(pw), role: body.role },
    select: { id: true, name: true, email: true, role: true },
  });
  const details = toProfileData(body);
  if (!details.employee_id) details.employee_id = await nextEmployeeId(session.tenantId);
  await prisma.staff_profiles.create({ data: { tenant_id: BigInt(session.tenantId), user_id: user.id, ...details } });
  await logHistory(session.tenantId, user.id, "STAFF_ADDED", `${body.name} added as ${body.role}`, session.userId);
  await applyDutyFromProfile(session.tenantId, user.id, body, session.userId);
  return json({ account: { id: Number(user.id), name: user.name, email: user.email, role: user.role, employeeId: details.employee_id }, ...(body.password ? {} : { tempPassword: pw }) }, 201);
});
