import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

const schema = z.object({ photoDataUrl: z.string().max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,/).or(z.literal("")) });

// My own profile photo (any signed-in person of a facility). It is also the
// reference face shown next to the attendance photo.
export const GET = apiRoute(null, async (_r, { session }) => {
  if (session.tenantId == null) return json({ photo: null });
  const p = await prisma.staff_profiles.findFirst({ where: { user_id: BigInt(session.userId), tenant_id: BigInt(session.tenantId) }, select: { photo_url: true } });
  return json({ photo: p?.photo_url || null });
});

export const PUT = apiRoute(null, async (request, { session }) => {
  if (session.tenantId == null) throw new HttpError(403, "not_for_platform_accounts");
  const { photoDataUrl } = await parseBody(request, schema);
  const where = { user_id: BigInt(session.userId) };
  const existing = await prisma.staff_profiles.findFirst({ where: { ...where, tenant_id: BigInt(session.tenantId) }, select: { id: true } });
  if (existing) await prisma.staff_profiles.update({ where: { id: existing.id }, data: { photo_url: photoDataUrl || null } });
  else await prisma.staff_profiles.create({ data: { tenant_id: BigInt(session.tenantId), user_id: BigInt(session.userId), photo_url: photoDataUrl || null } });
  return json({ ok: true });
});
