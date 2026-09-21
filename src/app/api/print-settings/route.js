import { apiRoute, json } from "@/lib/apiRoute";
import { prisma } from "@/lib/prismaClient";
import { merge } from "@/lib/printSettings";

export const dynamic = "force-dynamic";

// Read by any signed-in screen that offers "Print slip" (e.g. auto-print after registering).
export const GET = apiRoute(null, async (request, { session }) => {
  if (session.tenantId == null) return json({ settings: merge(null) });
  const t = await prisma.tenants.findUnique({ where: { id: BigInt(session.tenantId) }, select: { print_settings: true } });
  return json({ settings: merge(t?.print_settings) });
});
