"use strict";

const { can } = require("./rbac");

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
  { key: "radiology", label: "Radiology", section: "CLINICAL", icon: "radiology", action: null, modules: ["RADIOLOGY"], status: "soon" },

  // ── Operations ──
  { key: "registration", label: "Registration", section: "OPERATIONS", route: "/dashboard/registration", icon: "registration", action: "visit:create", tenantTypes: ["HOSPITAL", "DOCTOR_SOLO"], status: "live" },
  { key: "billing", label: "Billing", section: "OPERATIONS", route: "/dashboard/billing", icon: "billing", action: "bill:create", modules: ["BILLING"], status: "live" },
  { key: "appointments", label: "Appointments", section: "OPERATIONS", icon: "appointments", action: null, modules: ["APPOINTMENTS"], status: "soon" },
  { key: "reports", label: "Reports & Analytics", section: "OPERATIONS", icon: "reports", action: "reports:view", status: "soon" },

  // ── Administration (admin / owner only) ──
  { key: "staff", label: "Staff Management", section: "ADMINISTRATION", icon: "staff", action: "staff:manage", tenantTypes: ["HOSPITAL"], adminOnly: true, status: "soon" },
  { key: "forms", label: "Form Builder", section: "ADMINISTRATION", route: "/dashboard/admin/forms", icon: "forms", action: "formtemplate:manage", adminOnly: true, status: "live" },
  { key: "branding", label: "Branding", section: "ADMINISTRATION", route: "/dashboard/branding", icon: "branding", action: "branding:read", adminOnly: false, status: "live" },

  // ── Platform (SUPER_ADMIN only) ──
  { key: "tenants", label: "Tenants", section: "PLATFORM", route: "/dashboard/platform/tenants", icon: "tenants", status: "soon" },
  { key: "createTenant", label: "Create Tenant", section: "PLATFORM", route: "/dashboard/platform/tenants/new", icon: "createTenant", status: "soon" },
  { key: "registry", label: "Module Registry", section: "PLATFORM", route: "/dashboard/platform/modules", icon: "registry", status: "soon" },
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
