import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { completeInbound } from "@/lib/partners";

export const dynamic = "force-dynamic";

export const POST = apiRoute("visit:create", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "referral_not_found");
  const { note } = await parseBody(request, z.object({ note: z.string().trim().max(300).optional() }));
  const order = await prisma.peer_inbound_orders.findFirst({ where: { id: BigInt(id), tenant_id: BigInt(session.tenantId) }, select: { order_type: true } });
  if (!order || order.order_type !== "REFERRAL") throw new HttpError(404, "referral_not_found");
  await completeInbound(session, id, { referral: { accepted: false, note: note || "" } }, "");
  return json({ ok: true });
});
