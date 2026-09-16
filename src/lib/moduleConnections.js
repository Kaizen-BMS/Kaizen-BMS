"use strict";

const { HttpError } = require("./apiRoute");
const { getContract, sanitizeGrant } = require("./dataContracts");
const { validateContractPayload } = require("./dataContractValidator");

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
async function requestConnection(db, { tenantId, sourceInstanceId, targetInstanceId, connectionType, allowedFields, permissions, createdBy, purpose }) {
  const contract = getContract(connectionType);
  if (!contract) throw new HttpError(400, "unknown_connection_type");

  const source = await requireOwnInstance(db, tenantId, sourceInstanceId);
  const target = await requireOwnInstance(db, tenantId, targetInstanceId);
  if (source.module_name !== contract.sourceModule) throw new HttpError(400, "source_module_mismatch");
  if (target.module_name !== contract.targetModule) throw new HttpError(400, "target_module_mismatch");
  if (source.id === target.id) throw new HttpError(400, "source_equals_target");
  // Both instances must be ACTIVE — CLAUDE.md Phase 8A "Connection rules"
  // #2. A real gap found while testing this phase: this check never
  // existed before (only tenant ownership was verified), so a suspended
  // or archived instance could be connected. Fixed here, the one place
  // every connection request goes through.
  if (source.status !== "ACTIVE") throw new HttpError(409, "source_instance_not_active");
  if (target.status !== "ACTIVE") throw new HttpError(409, "target_instance_not_active");

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
      // The connection's "purpose/description" (Phase 8A — CLAUDE.md
      // "Module Selection + Connection Center") has nowhere of its own to
      // live on `module_connections` — reusing the existing audit event's
      // `note` field instead of adding a column: the request event already
      // records who/when, so recording *why* alongside it is the same
      // "one place this can drift" reasoning as everywhere else, not a
      // new concept.
      await tx.module_connection_events.create({
        data: {
          connection_id: connection.id,
          from_status: null,
          to_status: "PENDING",
          actor_user_id: toId(createdBy),
          note: (purpose || "").trim() ? purpose.trim().slice(0, 500) : "Connection requested.",
        },
      });
      return connection;
    });
  } catch (err) {
    if (err && err.code === "P2002") throw new HttpError(409, "connection_already_exists");
    throw err;
  }
}

/**
 * The full Part 13 contract-access checklist (CLAUDE.md "Master data +
 * data contract foundation") — the one function a future real consumer
 * (a Workflow Engine step, a webhook handler — none exists yet) would
 * call before actually using a contract to move data between two
 * modules. Checks, in order: both instances belong to this tenant, both
 * are ACTIVE, a connection exists between them, that connection is
 * ACTIVE, the contract exists/is active/matches the module pair, and the
 * payload passes `validateContractPayload()`. Authentication and RBAC
 * are the CALLER's responsibility (every route already goes through
 * `apiRoute()`) — this function only ever runs inside an already-
 * authenticated, already-tenant-scoped request.
 *
 * Returns `{ ok: true, contract, connection }` or
 * `{ ok: false, status, error }` — never throws, so a caller can decide
 * exactly how to respond (this project's existing 403/404/409/422
 * conventions) without a generic try/catch.
 */
async function checkContractAccess(db, { tenantId, sourceInstanceId, targetInstanceId, contractType, version, payload }) {
  const source = await db.module_instances.findFirst({ where: { id: toId(sourceInstanceId), tenant_id: toId(tenantId) } });
  if (!source) return { ok: false, status: 404, error: "source_instance_not_found" };
  const target = await db.module_instances.findFirst({ where: { id: toId(targetInstanceId), tenant_id: toId(tenantId) } });
  if (!target) return { ok: false, status: 404, error: "target_instance_not_found" };

  if (source.status !== "ACTIVE") return { ok: false, status: 409, error: "source_instance_not_active" };
  if (target.status !== "ACTIVE") return { ok: false, status: 409, error: "target_instance_not_active" };

  const connection = await db.module_connections.findFirst({
    where: { tenant_id: toId(tenantId), source_instance_id: source.id, target_instance_id: target.id, connection_type: contractType },
  });
  if (!connection) return { ok: false, status: 404, error: "connection_not_found" };
  if (connection.status !== "ACTIVE") return { ok: false, status: 409, error: "connection_not_active" };

  const contract = getContract(contractType, version);
  if (!contract) return { ok: false, status: 404, error: version != null ? "unknown_contract_version" : "unknown_contract" };
  if (contract.status !== "ACTIVE") return { ok: false, status: 409, error: "contract_inactive" };

  const validation = validateContractPayload(contractType, payload, {
    sourceModule: source.module_name,
    targetModule: target.module_name,
    version,
  });
  if (!validation.valid) return { ok: false, status: 422, error: "invalid_payload", errors: validation.errors };

  return { ok: true, contract, connection };
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

const CONNECTION_INCLUDE = {
  module_instances_module_connections_source_instance_idTomodule_instances: true,
  module_instances_module_connections_target_instance_idTomodule_instances: true,
};

/** One connection by id, tenant-scoped — null if it doesn't exist or belongs to another tenant (never a distinct "wrong tenant" response). */
async function getConnection(db, tenantId, connectionId) {
  const row = await db.module_connections.findFirst({
    where: { id: toId(connectionId), tenant_id: toId(tenantId) },
    include: CONNECTION_INCLUDE,
  });
  return row ? unwrapConnection(row) : null;
}

function unwrapConnection(r) {
  const {
    module_instances_module_connections_source_instance_idTomodule_instances: source,
    module_instances_module_connections_target_instance_idTomodule_instances: target,
    ...rest
  } = r;
  return { ...rest, source, target };
}

async function listConnections(db, tenantId) {
  const rows = await db.module_connections.findMany({
    where: { tenant_id: toId(tenantId) },
    include: CONNECTION_INCLUDE,
    orderBy: { created_at: "desc" },
  });
  return rows.map(unwrapConnection);
}

/** The append-only audit trail for one connection — CLAUDE.md Phase 3's "the log IS the audit trail" (Part 13, Phase 8A: reused, not duplicated). */
async function listConnectionEvents(db, tenantId, connectionId) {
  const connection = await db.module_connections.findFirst({
    where: { id: toId(connectionId), tenant_id: toId(tenantId) },
    select: { id: true },
  });
  if (!connection) throw new HttpError(404, "connection_not_found");
  const events = await db.module_connection_events.findMany({
    where: { connection_id: connection.id },
    orderBy: { created_at: "asc" },
    include: { users: { select: { name: true } } },
  });
  return events.map((e) => ({
    id: Number(e.id),
    fromStatus: e.from_status,
    toStatus: e.to_status,
    actorName: e.users?.name || null,
    note: e.note,
    createdAt: e.created_at,
  }));
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
  checkContractAccess,
  getConnection,
  listConnections,
  listConnectionEvents,
  serializeConnection,
};
