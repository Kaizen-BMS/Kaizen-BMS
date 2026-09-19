import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { completeInbound } from "@/lib/partners";

export const dynamic = "force-dynamic";

const schema = z.object({
  findings: z.string().trim().max(2000).optional(),
  quantityFulfilled: z.coerce.number().int().min(0).optional(),
});

// Returns the result to the requesting facility through its normal signed
// webhook pipeline (real HTTP call) — same checks as any external provider.
export const POST = apiRoute("partner:manage", async (request, { session, params }) => {
  const { id } = await params;
  const body = await parseBody(request, schema);
  return json(await completeInbound(session, id, body, `http://127.0.0.1:${process.env.PORT || 3000}`));
});
