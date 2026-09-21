import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { loadCatalog } from "@/lib/labCatalog";

export const dynamic = "force-dynamic";

// Active tests a doctor can pick from when ordering (name + price).
export const GET = apiRoute("laborder:create", async () => json({ tests: await loadCatalog(tenantDb, { onlyActive: true }) }));
