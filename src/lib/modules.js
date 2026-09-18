"use strict";

const { prisma } = require("./prismaClient");
const { can } = require("./rbac");

const MODULE_NAMES = ["PHARMACY", "DOCTOR_OPD", "LAB", "BILLING", "IPD", "APPOINTMENTS", "RADIOLOGY"];

// The action that decides whether a role belongs in a module's Socket.io
// sub-room. A role joins `tenant:<id>:<module>` only if it can perform
// this action AND the hospital has the module active.
const MODULE_ROOM_ACTION = {
  DOCTOR_OPD: "consultation:create",
  PHARMACY: "stock:read",
  LAB: "lab:read",
  BILLING: "bill:create",
  IPD: "bed:read",
  APPOINTMENTS: "appointment:read",
  RADIOLOGY: "radiology:read",
};

// Which rentable module(s) an action needs — the tenant must have AT LEAST
// ONE of them active. Actions not listed are core (Registration / front desk
// / patient records / form config) and available to every tenant.
// Lab ordering is allowed from an OPD tenant (doctor orders it) OR a solo lab
// tenant (walk-in / referral), so it lists both.
const ACTION_MODULE = {
  "consultation:create": ["DOCTOR_OPD"],
  "consultation:read": ["DOCTOR_OPD"],
  "prescription:create": ["DOCTOR_OPD"],
  "prescription:read": ["DOCTOR_OPD", "PHARMACY"],
  "laborder:create": ["DOCTOR_OPD", "LAB"],
  "laborder:read": ["DOCTOR_OPD", "LAB"],
  "radiology:create": ["DOCTOR_OPD", "RADIOLOGY"],
  "radiology:read": ["DOCTOR_OPD", "RADIOLOGY"],
  "radiology:manage": ["RADIOLOGY"],
  "radiology:report": ["RADIOLOGY"],

  "stock:read": ["PHARMACY"],
  "stock:create": ["PHARMACY"],
  "stock:adjust": ["PHARMACY"],
  "dispense:create": ["PHARMACY"],
  "dispense:read": ["PHARMACY"],

  "lab:read": ["LAB"],
  "lab:collect": ["LAB"],
  "lab:receive": ["LAB"],
  "lab:result": ["LAB"],

  "bill:create": ["BILLING"],
  "bill:read": ["BILLING"],
  "bill:update": ["BILLING"],
  "service:read": ["BILLING"],
  "service:manage": ["BILLING"],
  "tariff:read": ["BILLING"],
  "tariff:manage": ["BILLING"],
  "reports:view": ["BILLING"],

  "bed:read": ["IPD"],
  "bed:manage": ["IPD"],
  "admission:create": ["IPD"],
  "admission:read": ["IPD"],
  "admission:update": ["IPD"],
  "nursingnote:create": ["IPD"],
  "nursingnote:read": ["IPD"],

  "doctorslot:manage": ["APPOINTMENTS"],
  "appointment:create": ["APPOINTMENTS"],
  "appointment:read": ["APPOINTMENTS"],
  "appointment:update": ["APPOINTMENTS"],
  "feedback:read": ["APPOINTMENTS"],
};

/** Module names an action may be satisfied by (empty = core, no gate). */
function requiredModules(action) {
  return ACTION_MODULE[action] || [];
}

// Called from apiRoute() BEFORE the tenant AsyncLocalStorage context exists
// (it decides whether to grant that context), and from server.js outside
// any request at all — so these use the raw `prisma` client with an
// explicit tenant_id filter, never the ambient-context `tenantDb`.

/** Active module names for a hospital. */
async function getActiveModules(tenantId) {
  if (tenantId == null) return [];
  const rows = await prisma.tenant_modules.findMany({
    where: { tenant_id: BigInt(tenantId), is_active: true },
    select: { module_name: true },
  });
  return rows.map((r) => r.module_name);
}

async function isModuleActive(tenantId, moduleName) {
  if (tenantId == null) return false;
  const row = await prisma.tenant_modules.findFirst({
    where: { tenant_id: BigInt(tenantId), module_name: moduleName, is_active: true },
    select: { id: true },
  });
  return !!row;
}

/** True if the tenant has any of `moduleNames` active. */
async function anyModuleActive(tenantId, moduleNames) {
  if (tenantId == null || moduleNames.length === 0) return false;
  const active = await getActiveModules(tenantId);
  return moduleNames.some((m) => active.includes(m));
}

/**
 * Which `tenant:<id>:<module>` sub-rooms a socket should join: the
 * intersection of the hospital's active modules and the modules this role
 * is allowed to work in. A pharmacist never joins the lab room, etc.
 * Returns lowercased module keys (matching emitToModule).
 */
function moduleRoomsForRole(role, activeModules) {
  return activeModules
    .filter((m) => {
      const action = MODULE_ROOM_ACTION[m];
      return action && can(role, action);
    })
    .map((m) => m.toLowerCase());
}

module.exports = {
  MODULE_NAMES,
  ACTION_MODULE,
  MODULE_ROOM_ACTION,
  requiredModules,
  getActiveModules,
  isModuleActive,
  anyModuleActive,
  moduleRoomsForRole,
};
