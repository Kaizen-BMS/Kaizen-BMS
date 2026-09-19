"use strict";

/**
 * External Connection lifecycle — deliberately mirrors
 * src/lib/moduleConnections.js's exact state machine and event-log
 * pattern (PENDING→ACTIVE→PAUSED/SUSPENDED→ACTIVE|REVOKED, an append-only
 * events table) for a (module_instance, external_provider) pair instead
 * of forcing external providers into the module_instances shape they
 * don't actually fit — see migration 033's own header comment for why.
 */
const { HttpError } = require("./apiRoute");
const { getContract, sanitizeGrant } = require("./dataContracts");
const { validateContractPayload } = require("./dataContractValidator");

const TERMINAL = new Set(["REVOKED"]);
const ALLOWED_TRANSITIONS = {
  PENDING: ["ACTIVE", "REVOKED"],
  ACTIVE: ["PAUSED", "SUSPENDED", "REVOKED"],
  PAUSED: ["ACTIVE", "REVOKED"],
  SUSPENDED: ["ACTIVE", "REVOKED"],
  REVOKED: [],
};

function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

async function requestExternalConnection(db, { tenantId, sourceInstanceId, providerId, connectionType, allowedFields, permissions, createdBy, purpose }) {
  const contract = getContract(connectionType);
  if (!contract) throw new HttpError(400, "unknown_connection_type");

  const source = await db.module_instances.findFirst({ where: { id: toId(sourceInstanceId), tenant_id: toId(tenantId) } });
  if (!source) throw new HttpError(404, "instance_not_found");
  if (source.status !== "ACTIVE") throw new HttpError(409, "source_instance_not_active");

  const provider = await db.external_providers.findFirst({ where: { id: toId(providerId), tenant_id: toId(tenantId) } });
  if (!provider) throw new HttpError(404, "provider_not_found");
  if (!provider.active) throw new HttpError(409, "provider_not_active");

  const grant = sanitizeGrant(connectionType, { allowedFields, permissions });

  try {
    return await db.$transaction(async (tx) => {
      const connection = await tx.external_connections.create({
        data: {
          tenant_id: toId(tenantId),
          source_instance_id: source.id,
          provider_id: provider.id,
          connection_type: connectionType,
          status: "PENDING",
          allowed_fields: JSON.stringify(grant.allowedFields),
          permissions: JSON.stringify(grant.permissions),
          created_by: toId(createdBy),
        },
      });
      await tx.external_connection_events.create({
        data: {
          connection_id: connection.id,
          from_status: null,
          to_status: "PENDING",
          actor_user_id: toId(createdBy),
          note: (purpose || "").trim() ? purpose.trim().slice(0, 500) : "External connection requested.",
        },
      });
      return connection;
    });
  } catch (err) {
    if (err && err.code === "P2002") throw new HttpError(409, "connection_already_exists");
    throw err;
  }
}

async function setExternalConnectionStatus(db, { tenantId, connectionId, toStatus, actorUserId, note }) {
  const connection = await db.external_connections.findFirst({ where: { id: toId(connectionId), tenant_id: toId(tenantId) } });
  if (!connection) throw new HttpError(404, "connection_not_found");
  if (TERMINAL.has(connection.status)) throw new HttpError(409, "connection_revoked");

  const allowed = ALLOWED_TRANSITIONS[connection.status] || [];
  if (!allowed.includes(toStatus)) throw new HttpError(409, "invalid_transition");

  return db.$transaction(async (tx) => {
    const data = { status: toStatus };
    if (toStatus === "ACTIVE" && connection.status === "PENDING") {
      data.approved_by = toId(actorUserId);
      data.approved_at = new Date();
    }
    const updated = await tx.external_connections.update({ where: { id: connection.id }, data });
    await tx.external_connection_events.create({
      data: { connection_id: connection.id, from_status: connection.status, to_status: toStatus, actor_user_id: toId(actorUserId), note: note || null },
    });
    return updated;
  });
}

const CONNECTION_INCLUDE = { module_instances: true, external_providers: true };

async function getExternalConnection(db, tenantId, connectionId) {
  const row = await db.external_connections.findFirst({ where: { id: toId(connectionId), tenant_id: toId(tenantId) }, include: CONNECTION_INCLUDE });
  return row ? unwrapConnection(row) : null;
}

function unwrapConnection(r) {
  const { module_instances: source, external_providers: provider, ...rest } = r;
  return { ...rest, source, provider };
}

async function listExternalConnections(db, tenantId) {
  const rows = await db.external_connections.findMany({ where: { tenant_id: toId(tenantId) }, include: CONNECTION_INCLUDE, orderBy: { created_at: "desc" } });
  return rows.map(unwrapConnection);
}

async function listExternalConnectionEvents(db, tenantId, connectionId) {
  const connection = await db.external_connections.findFirst({ where: { id: toId(connectionId), tenant_id: toId(tenantId) }, select: { id: true } });
  if (!connection) throw new HttpError(404, "connection_not_found");
  const events = await db.external_connection_events.findMany({
    where: { connection_id: connection.id },
    orderBy: { created_at: "asc" },
    include: { users: { select: { name: true } } },
  });
  return events.map((e) => ({ id: Number(e.id), fromStatus: e.from_status, toStatus: e.to_status, actorName: e.users?.name || null, note: e.note, createdAt: e.created_at }));
}

/**
 * Resolve which ACTIVE external connection (if any) a source instance has
 * to an ACTIVE provider of the given connection type — same "no silent
 * default, more than one requires explicit selection" discipline as
 * src/lib/moduleConnectionResolver.js's resolveConnectedInstance().
 */
async function resolveExternalConnection(db, { tenantId, sourceInstanceId, connectionType, preferredProviderId }) {
  const connections = await db.external_connections.findMany({
    where: { tenant_id: toId(tenantId), source_instance_id: toId(sourceInstanceId), connection_type: connectionType },
    include: { external_providers: true },
    orderBy: { updated_at: "desc" },
  });
  const relevant = connections.filter((c) => c.external_providers && c.external_providers.active);
  if (relevant.length === 0) return { ok: false, reason: "no_connection" };

  const active = relevant.filter((c) => c.status === "ACTIVE");
  if (active.length === 0) {
    const mostRecent = relevant[0];
    if (mostRecent.status === "REVOKED") return { ok: false, reason: "connection_revoked" };
    return { ok: false, reason: "connection_not_active", status: mostRecent.status };
  }
  if (preferredProviderId != null) {
    const match = active.find((c) => String(c.provider_id) === String(preferredProviderId));
    if (!match) return { ok: false, reason: "provider_not_connected" };
    return { ok: true, connection: match, provider: match.external_providers };
  }
  if (active.length === 1) return { ok: true, connection: active[0], provider: active[0].external_providers };
  return { ok: false, reason: "needs_selection", options: active.map((c) => ({ providerId: Number(c.provider_id), name: c.external_providers.name })) };
}

/**
 * The external-flavored checkContractAccess() — same checklist as
 * moduleConnections.js's own function, adapted to (instance, provider)
 * instead of (instance, instance): source active, connection exists and
 * ACTIVE, provider active, contract exists/active/matches, payload valid.
 */
async function checkExternalContractAccess(db, { tenantId, sourceInstanceId, providerId, contractType, version, payload }) {
  const source = await db.module_instances.findFirst({ where: { id: toId(sourceInstanceId), tenant_id: toId(tenantId) } });
  if (!source) return { ok: false, status: 404, error: "source_instance_not_found" };
  if (source.status !== "ACTIVE") return { ok: false, status: 409, error: "source_instance_not_active" };

  const provider = await db.external_providers.findFirst({ where: { id: toId(providerId), tenant_id: toId(tenantId) } });
  if (!provider) return { ok: false, status: 404, error: "provider_not_found" };
  if (!provider.active) return { ok: false, status: 409, error: "provider_not_active" };

  const connection = await db.external_connections.findFirst({
    where: { tenant_id: toId(tenantId), source_instance_id: source.id, provider_id: provider.id, connection_type: contractType },
  });
  if (!connection) return { ok: false, status: 404, error: "connection_not_found" };
  if (connection.status !== "ACTIVE") return { ok: false, status: 409, error: "connection_not_active" };

  const contract = getContract(contractType, version);
  if (!contract) return { ok: false, status: 404, error: version != null ? "unknown_contract_version" : "unknown_contract" };
  if (contract.status !== "ACTIVE") return { ok: false, status: 409, error: "contract_inactive" };

  const validation = validateContractPayload(contractType, payload, { sourceModule: source.module_name, targetModule: contract.targetModule, version });
  if (!validation.valid) return { ok: false, status: 422, error: "invalid_payload", errors: validation.errors };

  return { ok: true, contract, connection, provider };
}

function parseJsonArray(v) {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Send-time enforcement of what the connection's consent actually allows.
 * Fields outside allowed_fields are dropped (optional ones simply aren't
 * shared); if a REQUIRED field of the contract is not approved the whole
 * exchange is REJECTED — nothing is ever sent with extra or missing-consent
 * data. A connection with no allowed_fields column value (legacy) is not
 * restricted, exactly as before.
 */
function enforceApprovedFields(connection, payload) {
  if (!connection.allowed_fields) return payload;
  const allowed = new Set(parseJsonArray(connection.allowed_fields));
  const contract = getContract(connection.connection_type);
  const missing = (contract?.requiredFields || []).filter((f) => !allowed.has(f));
  if (missing.length) throw new HttpError(403, "data_not_approved");
  const out = {};
  for (const [k, v] of Object.entries(payload)) if (allowed.has(k)) out[k] = v;
  return out;
}

function serializeExternalConnection(row) {
  if (!row) return null;
  const { source, provider, ...rest } = row;
  return {
    id: Number(rest.id),
    tenantId: Number(rest.tenant_id),
    connectionType: rest.connection_type,
    status: rest.status,
    allowedFields: parseJsonArray(rest.allowed_fields),
    permissions: parseJsonArray(rest.permissions),
    createdBy: rest.created_by != null ? Number(rest.created_by) : null,
    approvedBy: rest.approved_by != null ? Number(rest.approved_by) : null,
    approvedAt: rest.approved_at,
    createdAt: rest.created_at,
    updatedAt: rest.updated_at,
    source: source ? { id: Number(source.id), name: source.name, moduleName: source.module_name, status: source.status } : { id: Number(rest.source_instance_id) },
    provider: provider ? { id: Number(provider.id), name: provider.name, providerType: provider.provider_type, providerCode: provider.provider_code } : { id: Number(rest.provider_id) },
  };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  requestExternalConnection,
  setExternalConnectionStatus,
  getExternalConnection,
  listExternalConnections,
  listExternalConnectionEvents,
  resolveExternalConnection,
  checkExternalContractAccess,
  enforceApprovedFields,
  serializeExternalConnection,
};
