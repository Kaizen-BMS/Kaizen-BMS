import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { getActiveModules } from "@/lib/modules";
import { getTenant, isSolo } from "@/lib/tenants";
import { visibleWidgets, quickActionsFor } from "@/lib/dashboard/registry";
import {
  getKpis,
  getPatientFlow,
  getAppointmentsToday,
  getIpdStatus,
  getPharmacyStatus,
  getLabStatus,
  getRadiologyStatus,
  getBillingStatus,
  getWeeklyCharts,
  getRecentActivity,
  getWorkflowSummary,
  getPlatformOverview,
} from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

/**
 * The one dashboard endpoint — CLAUDE.md "Dashboard — widget-driven
 * overview". `action: null` (just needs to be logged in — apiRoute()
 * already 401s otherwise) because different roles see different
 * SUBSETS of the same endpoint, decided by `visibleWidgets()`, not by a
 * single RBAC action gating the whole response. Tenant scope always
 * comes from the verified session (`tenantDb`'s auto-injection, or the
 * SUPER_ADMIN platform branch below) — never a client parameter.
 */
export const GET = apiRoute(null, async (request, { session }) => {
  const days = Number(new URL(request.url).searchParams.get("days")) || 7;
  if (session.tenantId == null) {
    const overview = await getPlatformOverview(prisma);
    return json({ scope: "PLATFORM", role: session.role, ...overview });
  }

  const tenant = await getTenant(session.tenantId);
  const activeModules = await getActiveModules(session.tenantId);
  const ctx = { role: session.role, tenantType: tenant?.type ?? null, activeModules };
  const widgets = visibleWidgets(ctx);
  const has = (key) => widgets.includes(key);

  // One failing section must never take the whole dashboard down (CLAUDE.md
  // "Dashboard — loading/empty/error states") — each query is caught
  // independently; a failure is logged server-side and reported back as
  // `failedWidgets` so the client can distinguish "not applicable to this
  // role/module" (the key is simply missing) from "failed to load" (the
  // key is in `failedWidgets`), instead of both looking like a silent gap.
  const failedWidgets = [];
  function safe(key, promise) {
    return promise.catch((err) => {
      console.error(`[dashboard] widget "${key}" failed:`, err);
      failedWidgets.push(key);
      return null;
    });
  }

  const [
    kpis,
    patientFlow,
    appointments,
    ipd,
    pharmacy,
    lab,
    radiology,
    billing,
    charts,
    recentActivity,
    workflows,
  ] = await Promise.all([
    has("kpis") ? safe("kpis", getKpis(tenantDb, ctx)) : null,
    has("patientFlow") ? safe("patientFlow", getPatientFlow(tenantDb)) : null,
    has("appointments") ? safe("appointments", getAppointmentsToday(tenantDb)) : null,
    has("ipd") ? safe("ipd", getIpdStatus(tenantDb)) : null,
    has("pharmacy") ? safe("pharmacy", getPharmacyStatus(tenantDb, session.tenantId)) : null,
    has("lab") ? safe("lab", getLabStatus(tenantDb)) : null,
    has("radiology") ? safe("radiology", getRadiologyStatus(tenantDb)) : null,
    has("billing") ? safe("billing", getBillingStatus(tenantDb)) : null,
    has("charts") ? safe("charts", getWeeklyCharts(tenantDb, { tenantCreatedAt: tenant.created_at, activeModules, days })) : null,
    has("recentActivity") ? safe("recentActivity", getRecentActivity(tenantDb, ctx)) : null,
    has("workflows") ? safe("workflows", getWorkflowSummary(tenantDb)) : null,
  ]);

  return json({
    scope: "TENANT",
    tenant: { name: tenant.name, type: tenant.type, solo: isSolo(tenant.type) },
    role: session.role,
    activeModules,
    widgets,
    failedWidgets,
    kpis,
    patientFlow,
    appointments,
    ipd,
    pharmacy,
    lab,
    radiology,
    billing,
    charts,
    recentActivity,
    workflows,
    quickActions: has("quickActions") ? quickActionsFor(session.role, activeModules) : [],
  });
});
