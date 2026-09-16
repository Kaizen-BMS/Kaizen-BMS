import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { MODULE_REGISTRY } from "@/lib/moduleRegistry";
import { listConnections } from "@/lib/moduleConnections";

export const dynamic = "force-dynamic";

// Module Management overview (Phase 8A — CLAUDE.md "Module Selection +
// Connection Center"). One composition endpoint over three ALREADY-tenant-
// scoped sources — `tenant_modules` (still the sole source of truth for
// "is this module active," untouched), `module_instances`, and
// `module_connections` — so the Modules page needs one call instead of
// three. No new table, no second activation system.
export const GET = apiRoute("module:read", async (_request, { session }) => {
  const [tenantModules, instances, connections] = await Promise.all([
    tenantDb.tenant_modules.findMany({ where: {}, select: { module_name: true, is_active: true } }),
    tenantDb.module_instances.findMany({ where: {}, select: { module_name: true, status: true } }),
    listConnections(tenantDb, session.tenantId),
  ]);

  const activeByModule = new Map(tenantModules.map((m) => [m.module_name, m.is_active]));
  const instanceCounts = new Map();
  for (const i of instances) {
    if (i.status === "ARCHIVED") continue;
    instanceCounts.set(i.module_name, (instanceCounts.get(i.module_name) || 0) + 1);
  }

  // Which other modules each module currently has an ACTIVE connection to
  // — derived from the same connections list the Connection Center itself
  // reads, never a separate calculation.
  const connectedModules = new Map();
  const addEdge = (a, b) => {
    if (!connectedModules.has(a)) connectedModules.set(a, new Set());
    connectedModules.get(a).add(b);
  };
  for (const c of connections) {
    if (c.status !== "ACTIVE") continue;
    const sourceModule = c.source?.module_name;
    const targetModule = c.target?.module_name;
    if (!sourceModule || !targetModule) continue;
    addEdge(sourceModule, targetModule);
    addEdge(targetModule, sourceModule);
  }

  const modules = MODULE_REGISTRY.map((m) => ({
    ...m,
    active: !!activeByModule.get(m.key),
    instanceCount: instanceCounts.get(m.key) || 0,
    connectedModules: Array.from(connectedModules.get(m.key) || []),
  }));

  return json({ modules });
});
