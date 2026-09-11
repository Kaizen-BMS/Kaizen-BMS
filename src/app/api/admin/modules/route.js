import { apiRoute, json } from "@/lib/apiRoute";
import { MODULE_REGISTRY } from "@/lib/moduleRegistry";

export const dynamic = "force-dynamic";

export const GET = apiRoute("tenant:read", async () => json({ modules: MODULE_REGISTRY }));
