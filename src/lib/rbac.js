"use strict";

/**
 * Role → allowed actions. Every reading/mutating API route names an action;
 * `apiRoute(action, handler)` checks `can(role, action)` before anything
 * else. "*" means every action (still tenant-scoped).
 *
 * Action grammar: "<resource>:<verb>". Resources that belong to a rentable
 * module are additionally gated in modules.js.
 *
 * Solo owner roles (OWNER_*) = their staff role's clinical actions + the
 * tenant-admin actions a solo operator needs (form customization, own
 * branding). No staff-management actions — a solo tenant has no staff.
 */
const ROLES = [
  "SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "DOCTOR",
  "NURSE",
  "PHARMACIST",
  "LAB_TECH",
  "BILLING_STAFF",
  "RECEPTIONIST",
  "OWNER_DOCTOR",
  "OWNER_PHARMACIST",
  "OWNER_LAB_TECH",
];

// Staff Management self-service: every staff role (not OWNER_* — a solo
// tenant has no staff hierarchy, same exclusion as attendance:self) can see
// the duty roster and who's on leave when, and submit their own leave
// request. staffroster:read does NOT imply seeing a colleague's leave
// REASON — that's a privacy boundary enforced in the API by ownership,
// never by the RBAC action alone (see CLAUDE.md "Staff Management").
const STAFF_SELF_SERVICE = ["staffroster:read", "leaverequest:create"];

const RECEPTIONIST = [
  "patient:create",
  "patient:read",
  "patient:update",
  "visit:create",
  "visit:read",
  "visit:update",
  "followup:create",
  "followup:read",
  "formtemplate:read",
  "attendance:self",
  "attendance:proxy",
  "staffmember:read",
  "appointment:create",
  "appointment:read",
  "appointment:update",
  // Bypasses normal queue fairness (a priority walk-in, or correcting a
  // numbering mistake) — accountable, not silent: see visit:override_token
  // in registration/patients and registration/visits.
  "visit:override_token",
  ...STAFF_SELF_SERVICE,
];

const DOCTOR = [
  "patient:read",
  "visit:read",
  "visit:update",
  "consultation:create",
  "consultation:read",
  "prescription:create",
  "prescription:read",
  "laborder:create",
  "laborder:read",
  "followup:create",
  "followup:read",
  "bill:read",
  "formtemplate:read",
  "branding:read",
  "branding:manage_own",
  // Admission is a clinical decision — the doctor orders/discharges.
  // Day-to-day ward/bed status and nursing notes are NURSE territory, not
  // doctor territory (see NURSE below) — deliberately not given bed:manage
  // or nursingnote:create here.
  "bed:read",
  "admission:create",
  "admission:read",
  "admission:update",
  "nursingnote:read",
  "attendance:self",
  // A doctor manages their own weekly availability template and their own
  // appointment calendar — not another doctor's (enforced in the API by
  // scoping doctorslot:manage writes to the caller's own doctor_user_id).
  "doctorslot:manage",
  "appointment:create",
  "appointment:read",
  "appointment:update",
  ...STAFF_SELF_SERVICE,
];

// Ward/bed housekeeping and nursing notes are realistically nurse-run, not
// doctor-run. A nurse can see and act on the bed board day to day, but
// admitting/discharging (the clinical decision) stays with the doctor.
const NURSE = [
  "patient:read",
  "visit:read",
  "bed:read",
  "bed:manage",
  "admission:read",
  "nursingnote:create",
  "nursingnote:read",
  "formtemplate:read",
  "branding:read",
  "attendance:self",
  ...STAFF_SELF_SERVICE,
];

const PHARMACIST = [
  "patient:read",
  "visit:read",
  "prescription:read",
  "stock:read",
  "stock:create",
  "stock:adjust",
  "dispense:create",
  "dispense:read",
  "bill:read",
  "formtemplate:read",
  "branding:read",
  "attendance:self",
  ...STAFF_SELF_SERVICE,
];

const LAB_TECH = [
  "patient:read",
  "visit:read",
  "laborder:read",
  "lab:read",
  "lab:collect",
  "lab:receive",
  "lab:result",
  "formtemplate:read",
  "branding:read",
  "branding:manage_own",
  "attendance:self",
  ...STAFF_SELF_SERVICE,
];

const BILLING_STAFF = [
  "patient:read",
  "visit:read",
  "visit:update",
  "consultation:read",
  "prescription:read",
  "laborder:read",
  "dispense:read",
  "bill:create",
  "bill:read",
  "bill:update",
  "followup:create",
  "followup:read",
  "formtemplate:read",
  "branding:read",
  "attendance:self",
  ...STAFF_SELF_SERVICE,
];

// A solo owner also runs the account: manages their own forms and branding,
// and does the front-desk actions a one-person operation needs.
const OWNER_EXTRAS = [
  "patient:create",
  "patient:update",
  "visit:create",
  "formtemplate:manage",
  "branding:manage_tenant",
  "referral:manage",
];

const PERMISSIONS = {
  SUPER_ADMIN: ["*"],
  HOSPITAL_ADMIN: ["*"],

  RECEPTIONIST,
  DOCTOR,
  NURSE,
  PHARMACIST,
  LAB_TECH,
  BILLING_STAFF,

  OWNER_DOCTOR: [...new Set([...DOCTOR, ...OWNER_EXTRAS])],
  OWNER_PHARMACIST: [...new Set([...PHARMACIST, ...OWNER_EXTRAS])],
  OWNER_LAB_TECH: [...new Set([...LAB_TECH, ...OWNER_EXTRAS, "laborder:create"])],
};

function can(role, action) {
  const allowed = PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.includes("*") || allowed.includes(action);
}

module.exports = { ROLES, PERMISSIONS, can };
