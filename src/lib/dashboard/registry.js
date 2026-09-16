"use strict";

/**
 * The smallest useful dashboard widget registry — mirrors navRegistry.js's
 * own shape and filtering style deliberately (`visibleWidgets(ctx)` next
 * to `visibleNav(ctx)`), so a future module can register a widget the
 * same way it already registers a nav entry, without a second framework
 * to learn. NOT a generic layout/drag-drop engine — that's explicitly a
 * later phase (CLAUDE.md "Dashboard — widget-driven overview").
 *
 * Entry:
 *   key             unique id, also the section key returned by the API
 *   title           display label
 *   category        KPI | OPERATIONS | CHART | ACTIVITY
 *   requiredModule  a rentable TenantModule name, or null (core, always available)
 *   roles           which roles see this widget at all (before module/tenant-type checks)
 *   tenantTypes     allowed tenant types, or null (all)
 *   size            "small" | "medium" | "large" — a layout hint for the client
 */
const WIDGETS = [
  { key: "kpis", title: "Today at a glance", category: "KPI", requiredModule: null, roles: "*", tenantTypes: null, size: "large" },
  { key: "patientFlow", title: "Patient Flow", category: "OPERATIONS", requiredModule: null, roles: ["HOSPITAL_ADMIN", "RECEPTIONIST", "DOCTOR"], tenantTypes: ["HOSPITAL"], size: "medium" },
  { key: "appointments", title: "Appointments", category: "OPERATIONS", requiredModule: "APPOINTMENTS", roles: ["HOSPITAL_ADMIN", "RECEPTIONIST", "DOCTOR", "OWNER_DOCTOR"], tenantTypes: null, size: "medium" },
  { key: "ipd", title: "IPD / Beds", category: "OPERATIONS", requiredModule: "IPD", roles: ["HOSPITAL_ADMIN", "NURSE", "DOCTOR"], tenantTypes: ["HOSPITAL"], size: "medium" },
  { key: "pharmacy", title: "Pharmacy", category: "OPERATIONS", requiredModule: "PHARMACY", roles: ["HOSPITAL_ADMIN", "PHARMACIST", "OWNER_PHARMACIST"], tenantTypes: null, size: "medium" },
  { key: "lab", title: "Laboratory", category: "OPERATIONS", requiredModule: "LAB", roles: ["HOSPITAL_ADMIN", "LAB_TECH", "OWNER_LAB_TECH"], tenantTypes: null, size: "medium" },
  { key: "billing", title: "Billing", category: "OPERATIONS", requiredModule: "BILLING", roles: ["HOSPITAL_ADMIN", "BILLING_STAFF"], tenantTypes: null, size: "medium" },
  { key: "charts", title: "Last 7 days", category: "CHART", requiredModule: null, roles: ["HOSPITAL_ADMIN", "OWNER_DOCTOR", "OWNER_PHARMACIST", "OWNER_LAB_TECH"], tenantTypes: null, size: "large" },
  { key: "recentActivity", title: "Recent Activity", category: "ACTIVITY", requiredModule: null, roles: "*", tenantTypes: null, size: "medium" },
  { key: "quickActions", title: "Quick Actions", category: "ACTIVITY", requiredModule: null, roles: "*", tenantTypes: null, size: "small" },
];

/**
 * Which widget keys a given viewer should receive. `ctx` = { role,
 * tenantType, activeModules }. Mirrors navRegistry.js's `visibleNav()`
 * logic exactly — same three checks (role, module, tenant type), same
 * order.
 */
function visibleWidgets(ctx) {
  const active = new Set(ctx.activeModules || []);
  return WIDGETS.filter((w) => {
    if (w.roles !== "*" && !w.roles.includes(ctx.role)) return false;
    if (w.requiredModule && !active.has(w.requiredModule)) return false;
    if (w.tenantTypes && !w.tenantTypes.includes(ctx.tenantType)) return false;
    return true;
  }).map((w) => w.key);
}

// Per-role quick actions — reuses existing routes only, never a new workflow.
const QUICK_ACTIONS = {
  HOSPITAL_ADMIN: [
    { label: "Register Patient", href: "/dashboard/registration" },
    { label: "Book Appointment", href: "/dashboard/appointments", requiredModule: "APPOINTMENTS" },
    { label: "OPD Queue", href: "/dashboard/opd" },
    { label: "IPD / Beds", href: "/dashboard/ipd", requiredModule: "IPD" },
    { label: "Pharmacy", href: "/dashboard/pharmacy", requiredModule: "PHARMACY" },
    { label: "Lab", href: "/dashboard/lab", requiredModule: "LAB" },
    { label: "Billing", href: "/dashboard/billing", requiredModule: "BILLING" },
  ],
  RECEPTIONIST: [
    { label: "Register Patient", href: "/dashboard/registration" },
    { label: "Book Appointment", href: "/dashboard/appointments", requiredModule: "APPOINTMENTS" },
    { label: "Attendance", href: "/dashboard/attendance" },
  ],
  DOCTOR: [
    { label: "OPD Queue", href: "/dashboard/opd" },
    { label: "Appointments", href: "/dashboard/appointments", requiredModule: "APPOINTMENTS" },
  ],
  OWNER_DOCTOR: [{ label: "OPD Queue", href: "/dashboard/opd" }, { label: "Appointments", href: "/dashboard/appointments", requiredModule: "APPOINTMENTS" }],
  NURSE: [{ label: "IPD / Beds", href: "/dashboard/ipd", requiredModule: "IPD" }, { label: "Attendance", href: "/dashboard/attendance" }],
  PHARMACIST: [{ label: "Pharmacy Queue", href: "/dashboard/pharmacy" }],
  OWNER_PHARMACIST: [{ label: "Pharmacy Queue", href: "/dashboard/pharmacy" }],
  LAB_TECH: [{ label: "Lab Queue", href: "/dashboard/lab" }],
  OWNER_LAB_TECH: [{ label: "Lab Queue", href: "/dashboard/lab" }],
  BILLING_STAFF: [{ label: "Billing", href: "/dashboard/billing" }],
};

function quickActionsFor(role, activeModules) {
  const active = new Set(activeModules || []);
  return (QUICK_ACTIONS[role] || []).filter((a) => !a.requiredModule || active.has(a.requiredModule));
}

module.exports = { WIDGETS, visibleWidgets, quickActionsFor };
