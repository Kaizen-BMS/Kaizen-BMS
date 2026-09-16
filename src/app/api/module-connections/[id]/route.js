import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { setConnectionStatus, getConnection, listConnectionEvents, serializeConnection } from "@/lib/moduleConnections";
import { CONNECTION_TYPES } from "@/lib/dataContracts";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Connection details view (Phase 8A — CLAUDE.md "Module Selection +
// Connection Center"; Part 20 extended in Phase 8B "Master data + data
// contract foundation"): the connection itself, its full
// module_connection_events audit trail (status history + the purpose note
// recorded at request time), the ONE contract this connection actually
// uses, and — new in Phase 8B — every OTHER connectable contract
// available for this same source/target module pair, so an admin can see
// "which data relationships exist" for OPD -> Pharmacy generally, not
// just the one this particular connection happens to use. No new
// storage — same rows listConnections()/requestConnection() already
// read/write, plus the CONNECTION_TYPES catalog already loaded.
export const GET = apiRoute("moduleconnection:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const connection = await getConnection(tenantDb, ctx.session.tenantId, id);
  if (!connection) return json({ error: "not_found" }, 404);
  const events = await listConnectionEvents(tenantDb, ctx.session.tenantId, id);

  const sourceModule = connection.source?.module_name;
  const targetModule = connection.target?.module_name;
  const availableContracts = Object.entries(CONNECTION_TYPES)
    .filter(([, c]) => c.connectable !== false && c.sourceModule === sourceModule && c.targetModule === targetModule)
    .map(([key, c]) => ({ key, ...c }));

  return json({
    connection: serializeConnection(connection),
    events,
    contract: CONNECTION_TYPES[connection.connection_type] || null,
    availableContracts,
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
