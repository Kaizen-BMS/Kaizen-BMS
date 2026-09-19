import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { completeInbound } from "@/lib/partners";

export const dynamic = "force-dynamic";

const schema = z.object({ findings: z.string().trim().min(1).max(2000), amount: z.coerce.number().min(0).max(10000000).optional() });

// The lab enters the result on its own screen; it is recorded here and sent back to the requester.
export const POST = apiRoute("lab:result", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "order_not_found");
  const { findings, amount } = await parseBody(request, schema);
  return json(await completeInbound(session, id, { findings, amount }, `http://127.0.0.1:${process.env.PORT || 3000}`));
});
