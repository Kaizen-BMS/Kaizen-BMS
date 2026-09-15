"use strict";

const { HttpError } = require("./apiRoute");
const { getContract, sanitizeGrant } = require("./dataContracts");

/**
 * Module Connection Center — data/service layer, Phase 3 of the platform
 * rebuild (CLAUDE.md "Platform rebuild"). A connection is an explicit,
 * approved, revocable relationship between two module_instances, carrying
 * exactly which data-contract fields cross the boundary — never "share
 * everything." This phase builds the domain model, authorization and
 * lifecycle; the full authenticator-style UI (source -> target -> review
 * -> authorize) is a later phase — see the file's own routes for the
 * "basic foundation" this phase actually ships.
 *
 * Same-tenant only: both instances must belong to the SAME tenant. Every
 * instance lookup here goes through `tenantDb` (auto tenant_id-scoped), so
 * a cross-tenant instance id simply isn't found — 404, never a distinct
 * "wrong tenant" response, same no-leak discipline as every other
 * cross-tenant check in this codebase. Cross-tenant connections (a
 * standalone Pharmacy serving a Hospital) are a real future case the
 * schema doesn't block (see migration 024's own comment) but no function
 * here creates one yet.
 */

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

async function requireOwnInstance(db, tenantId, instanceId) {
  const instance = await db.module_instances.findFirst({
    where: { id: toId(instanceId), tenant_id: toId(tenantId) },
  });
  if (!instance) throw new HttpError(404, "instance_not_found");
  return instance;
}

/**
 * Create a PENDING connection between two of this tenant's own instances.
 * Validates: the contract exists, each instance's module matches what the
 * contract expects for that side, and the requested fields/permissions are
 * sanitized down to what the contract actually declares before they're
 * ever written — a caller cannot smuggle an unlisted field or action in.
 */
async function requestConnection(db, { tenantId, sourceInstanceId, targetInstanceId, connectionType, allowedFields, permissions, createdBy }) {
  const contract = getContract(connectionType);
  if (!contract) throw new HttpError(400, "unknown_connection_type");

  const source = await requireOwnInstance(db, tenantId, sourceInstanceId);
  const target = await requireOwnInstance(db, tenantId, targetInstanceId);
  if (source.module_name !== contract.sourceModule) throw new HttpError(400, "source_module_mismatch");
  if (target.module_name !== contract.targetModule) throw new HttpError(400, "target_module_mismatch");
  if (source.id === target.id) throw new HttpError(400, "source_equals_target");

  const grant = sanitizeGrant(connectionType, { allowedFields, permissions });

  try {
    return await db.$transaction(async (tx) => {
      const connection = await tx.module_connections.create({
        data: {
          tenant_id: toId(tenantId),
          source_instance_id: source.id,
          target_instance_id: target.id,
          connection_type: connectionType,
          status: "PENDING",
          allowed_fields: JSON.stringify(grant.allowedFields),
          permissions: JSON.stringify(grant.permissions),
          created_by: toId(createdBy),
        },
      });
      await tx.module_connection_events.create({
        data: {
          connection_id: connection.id,
          from_status: null,
          to_status: "PENDING",
          actor_user_id: toId(createdBy),
          note: "Connection requested.",
        },
      });
      return connection;
    });
  } catch (err) {
    if (err && err.code === "P2002") throw new HttpError(409, "connection_already_exists");
    throw err;
  }
}

/** ACTIVE/PAUSED/SUSPENDED/REVOKED transitions — every change is logged, nothing is ever silently overwritten or deleted. */
async function setConnectionStatus(db, { tenantId, connectionId, toStatus, actorUserId, note }) {
  const connection = await db.module_connections.findFirst({
    where: { id: toId(connectionId), tenant_id: toId(tenantId) },
  });
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
    const updated = await tx.module_connections.update({ where: { id: connection.id }, data });
    await tx.module_connection_events.create({
      data: {
        connection_id: connection.id,
        from_status: connection.status,
        to_status: toStatus,
        actor_user_id: toId(actorUserId),
        note: note || null,
      },
    });
    return updated;
  });
}

async function listConnections(db, tenantId) {
  const rows = await db.module_connections.findMany({
    where: { tenant_id: toId(tenantId) },
    include: {
      module_instances_module_connections_source_instance_idTomodule_instances: true,
      module_instances_module_connections_target_instance_idTomodule_instances: true,
    },
    orderBy: { created_at: "desc" },
  });
  return rows.map((r) => {
    const {
      module_instances_module_connections_source_instance_idTomodule_instances: source,
      module_instances_module_connections_target_instance_idTomodule_instances: target,
      ...rest
    } = r;
    return { ...rest, source, target };
  });
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

/** DB row (allowed_fields/permissions stored as JSON text, MariaDB's JSON is LONGTEXT under a CHECK constraint — same as patients.custom_fields) -> API shape. */
function serializeConnection(row) {
  if (!row) return null;
  const { source, target, module_instances_module_connections_source_instance_idTomodule_instances, module_instances_module_connections_target_instance_idTomodule_instances, ...rest } = row;
  const s = source || module_instances_module_connections_source_instance_idTomodule_instances;
  const t = target || module_instances_module_connections_target_instance_idTomodule_instances;
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
    source: s ? { id: Number(s.id), name: s.name, moduleName: s.module_name, status: s.status } : { id: Number(rest.source_instance_id) },
    target: t ? { id: Number(t.id), name: t.name, moduleName: t.module_name, status: t.status } : { id: Number(rest.target_instance_id) },
  };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  requestConnection,
  setConnectionStatus,
  listConnections,
  serializeConnection,
};
