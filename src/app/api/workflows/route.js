import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { listInstances } from "@/lib/workflows/engine";
import { listDefinitions } from "@/lib/workflows/definitions";

export const dynamic = "force-dynamic";

// workflow:read / workflow:manage are wildcard-only (SUPER_ADMIN /
// HOSPITAL_ADMIN), matching every other Phase 8A/8B admin-tooling screen
// (module:read, moduleinstance:read, moduleconnection:read, department:read)
// — no rbac.js changes needed. Deliberately not extended to clinical/
// billing staff roles (CLAUDE.md Phase 9 "RBAC" — do not give doctors or
// pharmacists workflow administration).
export const GET = apiRoute("workflow:read", async (request, ctx) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const definitionCode = url.searchParams.get("definitionCode") || undefined;

  const workflows = await listInstances(tenantDb, ctx.session.tenantId, { status, definitionCode });
  return json({ workflows, definitions: listDefinitions() });
});
