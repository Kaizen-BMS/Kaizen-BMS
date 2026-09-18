import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import {
  getExternalConnection,
  setExternalConnectionStatus,
  listExternalConnectionEvents,
  serializeExternalConnection,
} from "@/lib/externalConnections";

export const dynamic = "force-dynamic";

export const GET = apiRoute("external:read", async (request, { session, params }) => {
  const { id } = await params;
  const connection = await getExternalConnection(tenantDb, session.tenantId, id);
  if (!connection) throw new HttpError(404, "connection_not_found");
  const events = await listExternalConnectionEvents(tenantDb, session.tenantId, id);
  return json({ connection: serializeExternalConnection(connection), events });
});

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "SUSPENDED", "REVOKED"]),
  note: z.string().trim().max(500).optional(),
});

export const PATCH = apiRoute("external:manage", async (request, { session, params }) => {
  const { id } = await params;
  const body = await parseBody(request, patchSchema);
  const connection = await setExternalConnectionStatus(tenantDb, {
    tenantId: session.tenantId,
    connectionId: id,
    toStatus: body.status,
    actorUserId: session.userId,
    note: body.note,
  });
  return json({ connection: serializeExternalConnection({ ...connection, source: null, provider: null }) });
});
