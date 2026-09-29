import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { z } from "zod";
import { parseBody } from "@/lib/validate";
import { dispensePartnerOrder } from "@/lib/partnerDispense";

export const dynamic = "force-dynamic";

export const POST = apiRoute("dispense:create", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "order_not_found");
  // How much to actually dispense now (never more than the order asked
  // for — dispensePartnerOrder() caps it). Omitted = give the full amount
  // requested, same as before. The price is never taken from the caller
  // any more — it's computed from the real batch(es) consumed.
  const { quantity } = await parseBody(request, z.object({ quantity: z.coerce.number().int().min(1).max(1_000_000).optional() }));
  return json({ ok: true, ...(await dispensePartnerOrder(session, id, `http://127.0.0.1:${process.env.PORT || 3000}`, quantity)) });
});
