import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requestExternalConnection, listExternalConnections, serializeExternalConnection } from "@/lib/externalConnections";
import { CONNECTION_TYPES } from "@/lib/dataContracts";

export const dynamic = "force-dynamic";

// Mirrors module-connections' own GET/POST shape (Phase 3) for the
// external-provider-flavored lifecycle — same wildcard-only RBAC
// (external:read/external:manage), no ACTION_MODULE gate (not a rentable
// clinical module).

export const GET = apiRoute("external:read", async (request, { session }) => {
  const connections = await listExternalConnections(tenantDb, session.tenantId);
  return json({ connections: connections.map(serializeExternalConnection), contracts: CONNECTION_TYPES });
});

const createSchema = z.object({
  sourceInstanceId: z.coerce.number().int().positive(),
  providerId: z.coerce.number().int().positive(),
  connectionType: z.string().trim().min(1),
  allowedFields: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  purpose: z.string().trim().max(500).optional(),
});

export const POST = apiRoute("external:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const connection = await requestExternalConnection(tenantDb, {
    tenantId: session.tenantId,
    sourceInstanceId: body.sourceInstanceId,
    providerId: body.providerId,
    connectionType: body.connectionType,
    allowedFields: body.allowedFields,
    permissions: body.permissions,
    createdBy: session.userId,
    purpose: body.purpose,
  });
  return json({ connection: serializeExternalConnection({ ...connection, source: null, provider: null }) }, 201);
});
