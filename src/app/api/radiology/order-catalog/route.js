import { apiRoute, json } from "@/lib/apiRoute";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { isModuleActive } from "@/lib/modules";
import { loadStudies, loadStudySets } from "@/lib/radiologyCatalog";

export const dynamic = "force-dynamic";

// What a doctor can order from imaging: this facility's own radiology department (studies + study sets).
export const GET = apiRoute("radiology:create", async () => {
  const tenantId = requireTenantId();
  const me = await prisma.tenants.findUnique({ where: { id: BigInt(tenantId) }, select: { name: true } });
  const has = await isModuleActive(tenantId, "RADIOLOGY").catch(() => false);
  if (!has) return json({ provider: null });
  const [studies, sets] = await Promise.all([loadStudies(tenantDb, { onlyActive: true }), loadStudySets(tenantDb, { onlyActive: true })]);
  return json({ provider: { name: `${me?.name || "Our"} Radiology`, studies, sets } });
});
