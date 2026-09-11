"use strict";

/**
 * The Module Registry screen's catalog. Deliberately a static, code-defined
 * list, not a DB table: `tenant_modules.module_name` is a fixed MySQL ENUM
 * (migration 004), and every module also needs real routes/RBAC/room
 * wiring to mean anything — a "registry row" alone was never going to make
 * a brand-new module actually work. So this screen is honestly a read-only
 * catalog (what exists, what's rentable) rather than a form that pretends
 * to create new module types on the fly. See CLAUDE.md "Super Admin".
 */
const MODULE_REGISTRY = [
  {
    key: "DOCTOR_OPD",
    label: "Doctor / OPD",
    description: "Registration, consultations, prescriptions, allergy safety checks.",
    rentable: true,
  },
  {
    key: "PHARMACY",
    label: "Pharmacy",
    description: "Batch inventory, low-stock/expiry alerts, FEFO dispensing.",
    rentable: true,
  },
  {
    key: "LAB",
    label: "Lab",
    description: "Order lifecycle, result entry, diagnostic report print.",
    rentable: true,
  },
  {
    key: "IPD",
    label: "IPD / Beds",
    description: "Bed board, admissions, discharge, nursing notes.",
    rentable: true,
  },
  {
    key: "BILLING",
    label: "Billing",
    description: "OPD/IPD bills, payments, discounts, refunds, receipt print.",
    rentable: true,
  },
  {
    key: "RADIOLOGY",
    label: "Radiology",
    description: "Planned — not built yet, cannot be rented to a tenant.",
    rentable: false,
  },
  {
    key: "APPOINTMENTS",
    label: "Appointments",
    description: "Planned — not built yet, cannot be rented to a tenant.",
    rentable: false,
  },
];

module.exports = { MODULE_REGISTRY };
