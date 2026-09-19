import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { z } from "zod";
import { parseBody } from "@/lib/validate";
import { dispensePartnerOrder } from "@/lib/partnerDispense";

export const dynamic = "force-dynamic";

export const POST = apiRoute("dispense:create", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "order_not_found");
  const { amount } = await parseBody(request, z.object({ amount: z.coerce.number().min(0).max(10000000).optional() }));
  return json({ ok: true, ...(await dispensePartnerOrder(session, id, `http://127.0.0.1:${process.env.PORT || 3000}`, amount)) });
});
