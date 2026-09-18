"use strict";

/**
 * Shared "which connected instance should this operation use" resolver —
 * factored out of the Phase 8C Pharmacy availability route
 * (src/app/api/pharmacy/prescriptions/[prescriptionId]/availability/route.js)
 * so Phase 9's Workflow Engine can reuse the EXACT same connection-
 * resolution rule instead of re-implementing it: only an ACTIVE
 * module_connections row of the right connection_type, to an ACTIVE
 * instance of the right target module, is ever a valid target — never a
 * silent "tenant's default instance" fallback, which would defeat the
 * whole point of requiring a real, explicit connection.
 *
 * Returns one of:
 *   { ok: true, instance }
 *   { ok: false, reason: "no_connection" }              — no row of this type/pair exists at all
 *   { ok: false, reason: "connection_not_active", status }  — a row exists but is PENDING/PAUSED/SUSPENDED
 *   { ok: false, reason: "connection_revoked" }          — the (most recent) row is REVOKED — terminal
 *   { ok: false, reason: "instance_not_connected" }       — a specific preferredInstanceId was given but isn't among the ACTIVE ones
 *   { ok: false, reason: "needs_selection", options }     — more than one ACTIVE candidate and no preferredInstanceId given
 *
 * Never throws — callers (an interactive route, or the Workflow Engine's
 * own WAITING/FAILED classification) decide what each outcome means for
 * them.
 */
async function resolveConnectedInstance(db, { sourceInstanceId, targetModule, connectionType, preferredInstanceId }) {
  const connections = await db.module_connections.findMany({
    where: { source_instance_id: sourceInstanceId, connection_type: connectionType },
    include: { module_instances_module_connections_target_instance_idTomodule_instances: true },
    orderBy: { updated_at: "desc" },
  });
  const relevant = connections.filter((c) => {
    const inst = c.module_instances_module_connections_target_instance_idTomodule_instances;
    return inst && inst.module_name === targetModule;
  });

  if (relevant.length === 0) {
    return { ok: false, reason: "no_connection" };
  }

  const active = relevant.filter(
    (c) => c.status === "ACTIVE" && c.module_instances_module_connections_target_instance_idTomodule_instances.status === "ACTIVE",
  );

  if (active.length === 0) {
    // Most-recently-updated non-active row decides the diagnostic — a
    // REVOKED connection is terminal (never becomes usable again without a
    // brand-new connection), everything else (PENDING/PAUSED/SUSPENDED) is
    // transient/recoverable.
    const mostRecent = relevant[0];
    if (mostRecent.status === "REVOKED") return { ok: false, reason: "connection_revoked" };
    return { ok: false, reason: "connection_not_active", status: mostRecent.status };
  }

  if (preferredInstanceId != null) {
    const match = active.find((c) => String(c.module_instances_module_connections_target_instance_idTomodule_instances.id) === String(preferredInstanceId));
    if (!match) return { ok: false, reason: "instance_not_connected" };
    return { ok: true, instance: match.module_instances_module_connections_target_instance_idTomodule_instances };
  }

  if (active.length === 1) {
    return { ok: true, instance: active[0].module_instances_module_connections_target_instance_idTomodule_instances };
  }

  return {
    ok: false,
    reason: "needs_selection",
    options: active.map((c) => {
      const inst = c.module_instances_module_connections_target_instance_idTomodule_instances;
      return { id: Number(inst.id), name: inst.name };
    }),
  };
}

module.exports = { resolveConnectedInstance };
