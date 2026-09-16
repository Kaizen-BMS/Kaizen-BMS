import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requestConnection, listConnections, serializeConnection } from "@/lib/moduleConnections";
import { CONNECTION_TYPES } from "@/lib/dataContracts";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Phase 3 of the platform rebuild (CLAUDE.md "Platform rebuild") — basic
// admin foundation for the Module Connection Center: the data model,
// authorization and lifecycle. HOSPITAL_ADMIN only, same reasoning as
// module-instances/route.js. The full authenticator-style UI (select
// source -> target -> review data -> authorize) is a later phase.

export const GET = apiRoute("moduleconnection:read", async (_request, { session }) => {
  const connections = await listConnections(tenantDb, session.tenantId);
  return json({ connections: connections.map(serializeConnection), contracts: CONNECTION_TYPES });
});

const createSchema = z.object({
  sourceInstanceId: z.coerce.number().int().positive(),
  targetInstanceId: z.coerce.number().int().positive(),
  connectionType: z.enum(Object.keys(CONNECTION_TYPES)),
  allowedFields: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  // Free-text "why" — CLAUDE.md Phase 8A "Connection Center — create
  // connection". Stored on the request's own audit event, not a new column.
  purpose: z.string().trim().max(500).optional(),
});

export const POST = apiRoute("moduleconnection:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const connection = await requestConnection(tenantDb, {
    tenantId: session.tenantId,
    sourceInstanceId: body.sourceInstanceId,
    targetInstanceId: body.targetInstanceId,
    connectionType: body.connectionType,
    allowedFields: body.allowedFields,
    permissions: body.permissions,
    createdBy: session.userId,
    purpose: body.purpose,
  });
  const out = serializeConnection(connection);
  emitToTenant(session.tenantId, "module_connection:requested", { connection: out });
  return json({ connection: out }, 201);
});
