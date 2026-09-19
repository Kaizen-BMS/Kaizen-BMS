import { apiRoute, json } from "@/lib/apiRoute";
import { listInbound } from "@/lib/partners";

export const dynamic = "force-dynamic";

// The receiving side's copy of orders sent through an approved connection —
// approved fields only, as delivered.
export const GET = apiRoute("partner:manage", async (request, { session }) => {
  return json({ orders: await listInbound(session) });
});
