"use strict";

const { can } = require("./rbac");
const { NAV_FEATURE } = require("./featureAccess");

/**
 * Single source of truth for dashboard navigation. The sidebar, command
 * palette and topbar all derive from this — there is no per-module nav code.
 * When a Phase 2/3 module ships, add an entry here with `status: "live"` and
 * its route; it appears automatically for the right roles/tenants.
 *
 * Entry:
 *   key         unique id
 *   label       sidebar text
 *   section     OVERVIEW | CLINICAL | OPERATIONS | ADMINISTRATION | PLATFORM
 *   route       path (live entries only)
 *   icon        key in components/hms/icons
 *   action      permission required to see it (null = any logged-in)
 *   modules     any-of active tenant modules (null = not module-gated)
 *   tenantTypes allowed tenant types (null = all)
 *   badge       badge counter key (see /api/badges) or null
 *   status      "live" | "soon"
 *   adminOnly   also require admin/owner (formtemplate:manage) — for Admin section
 */
const SECTIONS = [
  { key: "OVERVIEW", label: null },
  { key: "CLINICAL", label: "Clinical" },
  { key: "OPERATIONS", label: "Operations" },
  { key: "ADMINISTRATION", label: "Administration" },
  { key: "PLATFORM", label: "Platform" },
];

const NAV = [
  { key: "overview", label: "Overview", section: "OVERVIEW", route: "/dashboard", icon: "overview", action: null, status: "live" },

  // ── Clinical ──
  { key: "opd", label: "Doctor / OPD", section: "CLINICAL", route: "/dashboard/opd", icon: "opd", action: "consultation:create", modules: ["DOCTOR_OPD"], status: "live" },
  { key: "pharmacy", label: "Pharmacy", section: "CLINICAL", route: "/dashboard/pharmacy", icon: "pharmacy", action: "stock:read", modules: ["PHARMACY"], badge: "pharmacy", status: "live" },
  { key: "lab", label: "Lab", section: "CLINICAL", route: "/dashboard/lab", icon: "lab", action: "lab:read", modules: ["LAB"], badge: "lab", status: "live" },
  { key: "ipd", label: "IPD / Beds", section: "CLINICAL", route: "/dashboard/ipd", icon: "ipd", action: "bed:read", modules: ["IPD"], tenantTypes: ["HOSPITAL"], badge: "ipd", status: "live" },
  { key: "radiology", label: "Radiology", section: "CLINICAL", route: "/dashboard/radiology", icon: "radiology", action: "radiology:read", modules: ["RADIOLOGY"], status: "live" },

  // ── Operations ──
  { key: "attendance", label: "Attendance", section: "OPERATIONS", route: "/dashboard/attendance", icon: "attendance", action: "attendance:self", status: "live" },
  { key: "registration", label: "Registration", section: "OPERATIONS", route: "/dashboard/registration", icon: "registration", action: "visit:create", tenantTypes: ["HOSPITAL", "DOCTOR_SOLO"], status: "live" },
  { key: "billing", label: "Billing", section: "OPERATIONS", route: "/dashboard/billing", icon: "billing", action: "bill:create", modules: ["BILLING"], status: "live" },
  { key: "todayAppointments", label: "Today's Appointments", section: "OPERATIONS", route: "/dashboard/appointments/today", icon: "appointments", action: "appointment:read", modules: ["APPOINTMENTS"], status: "live" },
  { key: "appointments", label: "Appointments", section: "OPERATIONS", route: "/dashboard/appointments", icon: "appointments", action: "appointment:read", modules: ["APPOINTMENTS"], status: "live" },
  { key: "reports", label: "Reports", section: "OPERATIONS", route: "/dashboard/reports", icon: "reports", action: "reports:view", modules: ["BILLING"], status: "live" },
  { key: "analytics", label: "Analytics", section: "OPERATIONS", route: "/dashboard/analytics", icon: "reports", action: "analytics:view", status: "live" },

  // ── Administration (admin / owner only) ──
  { key: "staff", label: "Staff Management", section: "ADMINISTRATION", route: "/dashboard/staff", icon: "staff", action: "staffroster:read", status: "live" },
  { key: "forms", label: "Form Builder", section: "ADMINISTRATION", route: "/dashboard/admin/forms", icon: "forms", action: "formtemplate:manage", adminOnly: true, tenantTypes: ["HOSPITAL", "DOCTOR_SOLO"], status: "live" },
  { key: "pricing", label: "Pricing", section: "ADMINISTRATION", route: "/dashboard/admin/pricing", icon: "billing", action: "service:manage", modules: ["BILLING"], adminOnly: true, status: "live" },
  { key: "myOrganizations", label: "My Facilities", section: "ADMINISTRATION", route: "/dashboard/admin/organizations", icon: "tenants", action: "partner:manage", adminOnly: true, status: "live" },
  { key: "partnerOrganizations", label: "Partners", section: "ADMINISTRATION", route: "/dashboard/admin/partners", icon: "registry", action: "partner:manage", adminOnly: true, status: "live" },
  { key: "activityLog", label: "Activity Log", section: "ADMINISTRATION", route: "/dashboard/admin/activity-log", icon: "reports", action: "staff:manage", status: "live" },
  { key: "settings", label: "Settings", section: "ADMINISTRATION", route: "/dashboard/admin/settings", icon: "forms", action: "formtemplate:manage", adminOnly: true, status: "live" },
  { key: "branding", label: "Branding", section: "ADMINISTRATION", route: "/dashboard/branding", icon: "branding", action: "branding:read", adminOnly: false, status: "live" },

  // ── Platform (SUPER_ADMIN only) ──
  { key: "tenants", label: "Tenants", section: "PLATFORM", route: "/dashboard/platform/tenants", icon: "tenants", action: "tenant:read", status: "live" },
  { key: "organizations", label: "Organizations", section: "PLATFORM", route: "/dashboard/platform/organizations", icon: "tenants", action: "tenant:read", status: "live" },
  { key: "createTenant", label: "Create Tenant", section: "PLATFORM", route: "/dashboard/platform/tenants/new", icon: "createTenant", action: "tenant:manage", status: "live" },
  { key: "registry", label: "Module Registry", section: "PLATFORM", route: "/dashboard/platform/modules", icon: "registry", action: "tenant:read", status: "live" },
  { key: "platformAnalytics", label: "Platform Analytics", section: "PLATFORM", route: "/dashboard/platform/analytics", icon: "reports", action: "analytics:platform", status: "live" },
];

/**
 * Filter NAV for a given viewer. `ctx` = { role, tenantId, tenantType,
 * activeModules: string[], allowDoctorBranding: bool }.
 */
function visibleNav(ctx) {
  const active = new Set(ctx.activeModules || []);
  const isPlatform = ctx.tenantId == null;

  return NAV.filter((n) => {
    if (isPlatform) {
      // Super Admin: only the platform tools + Overview.
      if (n.section !== "OVERVIEW" && n.section !== "PLATFORM") return false;
    } else if (n.section === "PLATFORM") {
      return false;
    }

    if (n.tenantTypes && !n.tenantTypes.includes(ctx.tenantType)) return false;
    if (n.modules && !n.modules.some((m) => active.has(m))) return false;

    if (n.adminOnly && !can(ctx.role, "formtemplate:manage")) return false;

    // Branding: visible to a tenant admin/owner always; to a plain staff
    // doctor only when their tenant allows personal branding.
    if (n.key === "branding") {
      const isAdmin = can(ctx.role, "formtemplate:manage");
      if (!isAdmin && !ctx.allowDoctorBranding) return false;
    }

    if (n.action && !can(ctx.role, n.action)) return false;
    // Features the admin switched off for this person disappear from their menu.
    if (ctx.deny && ctx.deny.length && NAV_FEATURE[n.key] && ctx.deny.includes(NAV_FEATURE[n.key])) return false;
    return true;
  });
}

/** Group visible items by section, dropping empty sections. */
function groupedNav(ctx) {
  const items = visibleNav(ctx);
  return SECTIONS.map((s) => ({
    ...s,
    items: items.filter((i) => i.section === s.key),
  })).filter((s) => s.items.length > 0);
}

module.exports = { SECTIONS, NAV, visibleNav, groupedNav };
