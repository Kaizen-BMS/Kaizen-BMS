import { apiRoute, json } from "@/lib/apiRoute";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { getDefaultInstance } from "@/lib/moduleInstances";
import { loadCatalog, loadPanels } from "@/lib/labCatalog";
import { isModuleActive } from "@/lib/modules";

export const dynamic = "force-dynamic";

// What a doctor can order, grouped by WHO will do the test: this facility's
// own laboratory, and every connected partner laboratory whose connection is
// active. Only the partner's test names, sample type, turnaround, price and
// test sets are shown — never anything else about that lab.
export const GET = apiRoute("laborder:create", async () => {
  const tenantId = requireTenantId();
  const me = await prisma.tenants.findUnique({ where: { id: BigInt(tenantId) }, select: { name: true } });
  const providers = [];

  if (await isModuleActive(tenantId, "LAB").catch(() => false)) {
    const [tests, panels] = await Promise.all([loadCatalog(tenantDb, { onlyActive: true }), loadPanels(tenantDb, { onlyActive: true })]);
    providers.push({ id: "own", own: true, name: `${me?.name || "Our"} Laboratory`, tests, panels });
  }

  const source = await getDefaultInstance(tenantDb, tenantId, "DOCTOR_OPD");
  if (source) {
    const conns = await tenantDb.external_connections.findMany({
      where: { source_instance_id: source.id, connection_type: "EXTERNAL_LAB_ORDER", status: "ACTIVE" },
      include: { external_providers: true },
    });
    for (const c of conns) {
      const ep = c.external_providers;
      if (!ep?.active || ep.provider_type !== "LAB" || !String(ep.provider_code).startsWith("PEER_")) continue;
      const oc = await prisma.org_connections.findFirst({
        where: { requester_tenant_id: BigInt(tenantId), service_type: "LAB", status: "ACTIVE", requester_provider_id: c.provider_id },
        select: { receiver_tenant_id: true },
      });
      if (!oc) continue;
      const [tests, panels] = await Promise.all([
        loadCatalog(prisma, { onlyActive: true, tenantId: oc.receiver_tenant_id }),
        loadPanels(prisma, { onlyActive: true, tenantId: oc.receiver_tenant_id }),
      ]);
      providers.push({
        id: String(Number(c.provider_id)),
        own: false,
        name: ep.name,
        tests: tests.map(({ name, sampleType, turnaroundHours, price }) => ({ id: null, serviceId: null, name, sampleType, turnaroundHours, price })),
        panels: panels.map((p) => ({ id: p.id, name: p.name, sampleType: p.sampleType, tests: p.tests.map((t) => ({ name: t.name, serviceId: null })) })),
      });
    }
  }
  return json({ providers });
});
