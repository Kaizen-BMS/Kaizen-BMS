import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { decide } from "@/lib/partners";

export const dynamic = "force-dynamic";

const schema = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  approvedCategories: z.array(z.string()).max(20).optional(),
  note: z.string().trim().max(500).optional(),
});

// Receiver-only: accept (optionally with a NARROWER set of shared
// information) or reject. Enforced inside decide() — the caller's tenant
// must be the receiver, and a requester cannot approve their own request.
export const POST = apiRoute("partner:manage", async (request, { session, params }) => {
  const { id } = await params;
  const body = await parseBody(request, schema);
  return json({ connection: await decide(session, id, body) });
});
