"use strict";

const { HttpError } = require("./apiRoute");

/**
 * Module Instance — Phase 2 of the platform rebuild (see CLAUDE.md
 * "Platform rebuild"). Separates MODULE DEFINITION (moduleRegistry.js's
 * static catalog — unchanged) from MODULE INSTANCE (a named, independently
 * lifecycled installed copy of a module: "Main Pharmacy" vs "Emergency
 * Pharmacy", both PHARMACY). `tenant_modules` stays the single source of
 * truth for "is this module active for this tenant at all" — every
 * existing RBAC/module-gate/socket-room check in src/lib/modules.js reads
 * it, completely unchanged. This file sits underneath that, answering a
 * question tenant_modules was never designed to answer: which instance.
 *
 * Every function here takes an explicit `tenantId`, never relying on the
 * AsyncLocalStorage context — callers include both tenant-scoped routes
 * (via `tenantDb`, which also auto-injects the same tenant_id — harmless
 * redundancy, not a conflict) and Super Admin routes (raw `prisma`, no
 * context at all, since a SUPER_ADMIN session has `tenantId: null`).
 */

const MODULE_INSTANCE_STATUSES = ["ACTIVE", "SUSPENDED", "ARCHIVED"];

// Default instance name per module — matches moduleRegistry.js's labels,
// used both by the migration's backfill and by ensureDefaultInstance()
// below when a module is activated for the first time after this phase.
const MODULE_LABEL = {
  PHARMACY: "Pharmacy",
  DOCTOR_OPD: "Doctor / OPD",
  LAB: "Lab",
  BILLING: "Billing",
  IPD: "IPD / Beds",
  APPOINTMENTS: "Appointments",
  RADIOLOGY: "Radiology",
};

function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

/** List every instance of a module for a tenant, newest default first. */
async function listInstances(db, tenantId, moduleName) {
  return db.module_instances.findMany({
    where: { tenant_id: toId(tenantId), module_name: moduleName },
    orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
  });
}

/** The instance every existing route implicitly means when no specific instance is named. */
async function getDefaultInstance(db, tenantId, moduleName) {
  return db.module_instances.findFirst({
    where: { tenant_id: toId(tenantId), module_name: moduleName, is_default: true },
  });
}

/**
 * Resolve which instance an operation applies to. No `instanceId` given ->
 * the tenant's default instance for that module (this is what makes every
 * existing Pharmacy call site keep working unchanged — they never send
 * one). An explicit `instanceId` is re-verified against tenant + module +
 * ACTIVE status before use — never trusted bare, same discipline as
 * `resolvePatientIdFilter`/`ownsPatient()` elsewhere in this codebase.
 */
async function resolveInstance(db, tenantId, moduleName, instanceId) {
  if (instanceId == null || instanceId === "") {
    const def = await getDefaultInstance(db, tenantId, moduleName);
    if (!def) throw new HttpError(409, "no_default_instance");
    return def;
  }
  const instance = await db.module_instances.findFirst({
    where: { id: toId(instanceId), tenant_id: toId(tenantId), module_name: moduleName },
  });
  if (!instance) throw new HttpError(404, "instance_not_found");
  if (instance.status !== "ACTIVE") throw new HttpError(409, "instance_not_active");
  return instance;
}

/**
 * Create a new, non-default instance of a module — "Emergency Pharmacy"
 * alongside the existing default "Pharmacy". The module must already be
 * active for the tenant (checked by the caller's normal module gate); this
 * only adds a second named operational copy under it.
 */
async function createInstance(db, { tenantId, moduleName, name, createdBy }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new HttpError(400, "name_required");
  try {
    return await db.module_instances.create({
      data: {
        tenant_id: toId(tenantId),
        module_name: moduleName,
        name: trimmed,
        status: "ACTIVE",
        is_default: false,
        created_by: createdBy != null ? toId(createdBy) : null,
      },
    });
  } catch (err) {
    if (err && err.code === "P2002") throw new HttpError(409, "instance_name_taken");
    throw err;
  }
}

/** ACTIVE/SUSPENDED/ARCHIVED transition. The default instance may be suspended (module-wide toggle already covers that) but never archived — archiving the one instance every existing route falls back to would silently break them. */
async function setInstanceStatus(db, { tenantId, instanceId, status, actorTenantId }) {
  if (!MODULE_INSTANCE_STATUSES.includes(status)) throw new HttpError(400, "invalid_status");
  const instance = await db.module_instances.findFirst({
    where: { id: toId(instanceId), tenant_id: toId(actorTenantId ?? tenantId) },
  });
  if (!instance) throw new HttpError(404, "instance_not_found");
  if (instance.is_default && status === "ARCHIVED") {
    throw new HttpError(409, "cannot_archive_default_instance");
  }
  return db.module_instances.update({ where: { id: instance.id }, data: { status } });
}

/**
 * Called whenever `tenant_modules.is_active` is toggled (Super Admin's
 * module rent/un-rent switch) — keeps every module's default instance in
 * sync automatically, so "Clinic later adds Pharmacy" creates a working
 * default instance with no manual step, and re-suspending a module
 * suspends its default instance the same way. An instance an admin
 * explicitly ARCHIVED is left alone — a bulk module toggle shouldn't
 * silently resurrect a specific instance someone deliberately retired.
 */
async function syncDefaultInstance(db, tenantId, moduleName, isActive) {
  const existing = await getDefaultInstance(db, tenantId, moduleName);
  if (!existing) {
    await db.module_instances.create({
      data: {
        tenant_id: toId(tenantId),
        module_name: moduleName,
        name: MODULE_LABEL[moduleName] || moduleName,
        status: isActive ? "ACTIVE" : "SUSPENDED",
        is_default: true,
      },
    });
    return;
  }
  if (existing.status === "ARCHIVED") return;
  const nextStatus = isActive ? "ACTIVE" : "SUSPENDED";
  if (existing.status !== nextStatus) {
    await db.module_instances.update({ where: { id: existing.id }, data: { status: nextStatus } });
  }
}

module.exports = {
  MODULE_INSTANCE_STATUSES,
  MODULE_LABEL,
  listInstances,
  getDefaultInstance,
  resolveInstance,
  createInstance,
  setInstanceStatus,
  syncDefaultInstance,
};
