import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { prisma } from "@/lib/prismaClient";
import { hashPassword } from "@/lib/auth";
import { tempPassword } from "@/lib/passwordReset";

export const dynamic = "force-dynamic";

// A facility admin resets one of THEIR OWN staff's passwords (Super Admin can
// reset anyone's). The new temporary password is returned once, never stored
// in plain text — the admin hands it over and the person changes it.
export const POST = apiRoute("staff:manage", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "user_not_found");
  const user = await prisma.users.findUnique({ where: { id: BigInt(id) }, select: { id: true, tenant_id: true, role: true, name: true, email: true } });
  if (!user || user.role === "SUPER_ADMIN") throw new HttpError(404, "user_not_found");
  if (session.tenantId != null && Number(user.tenant_id) !== Number(session.tenantId)) throw new HttpError(404, "user_not_found");
  const pw = tempPassword();
  await prisma.users.update({ where: { id: user.id }, data: { password_hash: await hashPassword(pw) } });
  return json({ user: { name: user.name, email: user.email }, tempPassword: pw });
});
