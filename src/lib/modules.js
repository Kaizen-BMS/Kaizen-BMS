"use strict";

const { query } = require("./db");
const { can } = require("./rbac");

const MODULE_NAMES = ["PHARMACY", "DOCTOR_OPD", "LAB", "BILLING", "IPD"];

// The action that decides whether a role belongs in a module's Socket.io
// sub-room. A role joins `tenant:<id>:<module>` only if it can perform
// this action AND the hospital has the module active.
const MODULE_ROOM_ACTION = {
  DOCTOR_OPD: "consultation:create",
  PHARMACY: "stock:read",
  LAB: "lab:read",
  BILLING: "bill:create",
  IPD: "bed:read",
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

  "bed:read": ["IPD"],
  "bed:manage": ["IPD"],
  "admission:create": ["IPD"],
  "admission:read": ["IPD"],
  "admission:update": ["IPD"],
  "nursingnote:create": ["IPD"],
  "nursingnote:read": ["IPD"],
};

/** Module names an action may be satisfied by (empty = core, no gate). */
function requiredModules(action) {
  return ACTION_MODULE[action] || [];
}

/** Active module names for a hospital. */
async function getActiveModules(tenantId) {
  if (tenantId == null) return [];
  const rows = await query(
    "SELECT module_name FROM tenant_modules WHERE tenant_id = ? AND is_active = 1",
    [tenantId],
  );
  return rows.map((r) => r.module_name);
}

async function isModuleActive(tenantId, moduleName) {
  if (tenantId == null) return false;
  const rows = await query(
    "SELECT 1 FROM tenant_modules WHERE tenant_id = ? AND module_name = ? AND is_active = 1 LIMIT 1",
    [tenantId, moduleName],
  );
  return rows.length > 0;
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
