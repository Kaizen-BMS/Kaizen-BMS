"use strict";

/**
 * Which login roles a facility may create, decided by what it actually has:
 * a role is offered only when the module it works in is active. Reception
 * fits any facility. Extra admins are a hospital thing.
 */
const ROLE_MODULE = {
  DOCTOR: "DOCTOR_OPD",
  NURSE: "IPD",
  PHARMACIST: "PHARMACY",
  LAB_TECH: "LAB",
  RADIOLOGY_STAFF: "RADIOLOGY",
  BILLING_STAFF: "BILLING",
  RECEPTIONIST: null,
};

const ROLE_LABEL = {
  HOSPITAL_ADMIN: "Admin",
  DOCTOR: "Doctor",
  NURSE: "Nurse",
  PHARMACIST: "Pharmacist",
  LAB_TECH: "Lab technician",
  RADIOLOGY_STAFF: "Radiology staff",
  BILLING_STAFF: "Billing",
  RECEPTIONIST: "Receptionist",
};

function allowedRoles(tenantType, activeModules) {
  const active = new Set(activeModules);
  const roles = Object.entries(ROLE_MODULE)
    .filter(([, mod]) => mod == null || active.has(mod))
    .map(([role]) => role);
  if (tenantType === "HOSPITAL") roles.unshift("HOSPITAL_ADMIN");
  return roles.map((r) => ({ role: r, label: ROLE_LABEL[r] }));
}

module.exports = { allowedRoles, ROLE_LABEL };
