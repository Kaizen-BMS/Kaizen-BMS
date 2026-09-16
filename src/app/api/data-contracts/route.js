import { apiRoute, json } from "@/lib/apiRoute";
import { CONNECTION_TYPES } from "@/lib/dataContracts";

export const dynamic = "force-dynamic";

// Read-only catalog view (Phase 8B — CLAUDE.md "Master data + data
// contract foundation", Part 19: contracts are system-defined, never
// admin-invented in this phase). Reuses the same `moduleconnection:read`
// action the Connection Center already gates its own contract-catalog
// read on — contracts are conceptually part of that same system, so no
// new RBAC action was introduced just for this view.
export const GET = apiRoute("moduleconnection:read", async () => {
  const contracts = Object.entries(CONNECTION_TYPES).map(([key, c]) => ({ key, ...c }));
  return json({ contracts });
});
