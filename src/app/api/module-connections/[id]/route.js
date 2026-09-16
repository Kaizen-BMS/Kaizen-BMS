import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { setConnectionStatus, getConnection, listConnectionEvents, serializeConnection } from "@/lib/moduleConnections";
import { CONNECTION_TYPES } from "@/lib/dataContracts";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Connection details view (Phase 8A — CLAUDE.md "Module Selection +
// Connection Center"): the connection itself plus its full
// module_connection_events audit trail (status history + the purpose note
// recorded at request time). No new storage — same rows listConnections()
// and requestConnection() already read/write.
export const GET = apiRoute("moduleconnection:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const connection = await getConnection(tenantDb, ctx.session.tenantId, id);
  if (!connection) return json({ error: "not_found" }, 404);
  const events = await listConnectionEvents(tenantDb, ctx.session.tenantId, id);
  return json({
    connection: serializeConnection(connection),
    events,
    contract: CONNECTION_TYPES[connection.connection_type] || null,
  });
});

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "SUSPENDED", "REVOKED"]),
  note: z.string().trim().max(500).optional(),
});

// Approve (PENDING -> ACTIVE), pause, suspend or revoke a connection.
// Every transition is validated against the lifecycle graph in
// moduleConnections.js and logged to module_connection_events — nothing
// is ever silently overwritten, and a REVOKED connection is terminal.
export const PATCH = apiRoute("moduleconnection:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, patchSchema);
  const connection = await setConnectionStatus(tenantDb, {
    tenantId: ctx.session.tenantId,
    connectionId: id,
    toStatus: body.status,
    actorUserId: ctx.session.userId,
    note: body.note,
  });
  const out = serializeConnection(connection);
  emitToTenant(ctx.session.tenantId, "module_connection:updated", { connection: out });
  return json({ connection: out });
});
