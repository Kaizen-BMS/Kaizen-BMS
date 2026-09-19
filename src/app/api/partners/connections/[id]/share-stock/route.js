import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({ share: z.boolean() });

// The PHARMACY side decides whether the connected hospital's doctors may see
// "available / not available" for its medicines. Off until switched on.
export const POST = apiRoute("partner:manage", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "connection_not_found");
  const { share } = await parseBody(request, schema);
  const c = await prisma.org_connections.findUnique({ where: { id: BigInt(id) } });
  if (!c || Number(c.receiver_tenant_id) !== Number(session.tenantId)) throw new HttpError(404, "connection_not_found");
  if (c.service_type !== "PHARMACY") throw new HttpError(409, "not_a_pharmacy_connection");
  await prisma.org_connections.update({ where: { id: c.id }, data: { share_stock: share } });
  emitToTenant(Number(c.requester_tenant_id), "partner:updated", { id: Number(c.id), status: c.status });
  return json({ ok: true, shareStock: share });
});
