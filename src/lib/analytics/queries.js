"use strict";

/**
 * Analytics read layer — every function reads ONLY analytics_daily_tenant /
 * analytics_daily_dimension (never re-aggregates the operational tables
 * directly; that's rollup.js's job, on its own schedule) so a dashboard
 * query is always a cheap indexed lookup over a handful of rows, never a
 * live full-table scan. Date-range support per this task's own spec:
 * Today/Yesterday/7d/30d/90d/12mo/Custom — all resolved to a single
 * [from, to] pair by resolveDateRange(), the one place that logic lives.
 */
const { tenantDb, prisma } = require("../prismaClient");

const RANGE_PRESETS = new Set(["today", "yesterday", "7d", "30d", "90d", "12mo", "custom"]);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** Resolves a UI range preset (or explicit from/to for "custom") into a [fromDate, toDate] inclusive pair, both date-only. */
function resolveDateRange({ range = "30d", from, to } = {}) {
  const preset = RANGE_PRESETS.has(range) ? range : "30d";
  const today = new Date(new Date().toISOString().slice(0, 10));

  if (preset === "custom") {
    if (!from || !to) {
      const err = new Error("custom range requires from and to");
      err.status = 400;
      throw err;
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      const err = new Error("invalid_date_range");
      err.status = 400;
      throw err;
    }
    const days = (toDate - fromDate) / (24 * 60 * 60 * 1000);
    if (days > 366) {
      const err = new Error("date_range_too_wide (max 366 days)");
      err.status = 400;
      throw err;
    }
    return { fromDate, toDate };
  }

  const offsets = { today: 0, yesterday: 1, "7d": 6, "30d": 29, "90d": 89, "12mo": 364 };
  const offsetDays = offsets[preset] ?? 29;
  if (preset === "yesterday") {
    const d = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return { fromDate: d, toDate: d };
  }
  const fromDate = new Date(today.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  return { fromDate, toDate: today };
}

/** Sums a set of numeric-metric fields across every daily row in range — plain JS reduction over at most 366 pre-aggregated rows, not raw operational data. */
function sumFields(rows, fields) {
  const out = {};
  for (const f of fields) out[f] = 0;
  for (const r of rows) {
    for (const f of fields) out[f] += Number(r[f] || 0);
  }
  return out;
}

async function fetchDailyRows(tenantId, fromDate, toDate) {
  return tenantDb.analytics_daily_tenant.findMany({
    where: { tenant_id: BigInt(tenantId), metric_date: { gte: fromDate, lte: toDate } },
    orderBy: { metric_date: "asc" },
  });
}

async function fetchDimensionRows(tenantId, fromDate, toDate, dimensionType) {
  return tenantDb.analytics_daily_dimension.findMany({
    where: { tenant_id: BigInt(tenantId), metric_date: { gte: fromDate, lte: toDate }, dimension_type: dimensionType },
    orderBy: { metric_date: "asc" },
  });
}

function serializeDaily(rows) {
  return rows.map((r) => ({
    date: isoDate(r.metric_date),
    ...Object.fromEntries(
      Object.entries(r)
        .filter(([k]) => !["id", "tenant_id", "metric_date", "computed_at"].includes(k))
        .map(([k, v]) => [k, v]),
    ),
  }));
}

function aggregateDimension(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const k = r.dimension_key;
    const cur = byKey.get(k) || { key: k, label: r.dimension_label, count: 0, value: 0, secondary: 0 };
    cur.count += r.metric_count;
    cur.value += Number(r.metric_value || 0);
    cur.secondary += r.metric_secondary;
    byKey.set(k, cur);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

// ── Hospital Operations ──────────────────────────────────────────────
async function getOperationsAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, ["patients_new", "patients_returning", "opd_visits", "admissions", "discharges", "beds_occupied", "beds_total"]);
  const latest = rows[rows.length - 1];
  return {
    range: { from: isoDate(fromDate), to: isoDate(toDate) },
    totals,
    occupancyPct: latest ? Number(latest.occupancy_pct) : 0,
    daily: serializeDaily(rows),
    wardBreakdown: aggregateDimension(await fetchDimensionRows(tenantId, fromDate, toDate, "WARD")),
  };
}

// ── Clinical ──────────────────────────────────────────────────────────
async function getClinicalAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, [
    "consultations", "prescriptions_created",
    "appointments_booked", "appointments_completed", "appointments_cancelled", "appointments_noshow",
  ]);
  return {
    range: { from: isoDate(fromDate), to: isoDate(toDate) },
    totals,
    daily: serializeDaily(rows),
    doctorWorkload: aggregateDimension(await fetchDimensionRows(tenantId, fromDate, toDate, "DOCTOR")),
  };
}

// ── Pharmacy ──────────────────────────────────────────────────────────
async function getPharmacyAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, ["pharmacy_items_dispensed", "pharmacy_dispensed_value"]);
  return {
    range: { from: isoDate(fromDate), to: isoDate(toDate) },
    totals,
    daily: serializeDaily(rows),
    topMedicines: aggregateDimension(await fetchDimensionRows(tenantId, fromDate, toDate, "MEDICINE")).slice(0, 20),
  };
}

// ── Lab ───────────────────────────────────────────────────────────────
async function getLabAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, ["lab_orders_created", "lab_orders_completed", "lab_revenue"]);
  const turnaroundRows = rows.filter((r) => r.lab_avg_turnaround_hours != null);
  const avgTurnaround = turnaroundRows.length
    ? turnaroundRows.reduce((s, r) => s + Number(r.lab_avg_turnaround_hours), 0) / turnaroundRows.length
    : null;
  return { range: { from: isoDate(fromDate), to: isoDate(toDate) }, totals, avgTurnaroundHours: avgTurnaround, daily: serializeDaily(rows) };
}

// ── Radiology ─────────────────────────────────────────────────────────
async function getRadiologyAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, ["radiology_orders_created", "radiology_orders_completed", "radiology_revenue"]);
  const turnaroundRows = rows.filter((r) => r.radiology_avg_turnaround_hours != null);
  const avgTurnaround = turnaroundRows.length
    ? turnaroundRows.reduce((s, r) => s + Number(r.radiology_avg_turnaround_hours), 0) / turnaroundRows.length
    : null;
  return { range: { from: isoDate(fromDate), to: isoDate(toDate) }, totals, avgTurnaroundHours: avgTurnaround, daily: serializeDaily(rows) };
}

// ── Billing / Finance ─────────────────────────────────────────────────
async function getBillingAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, ["revenue_total", "collections_total", "refunds_total", "discounts_total", "tax_total", "opd_revenue", "ipd_revenue"]);
  const latest = rows[rows.length - 1];
  return {
    range: { from: isoDate(fromDate), to: isoDate(toDate) },
    totals,
    outstandingEod: latest ? latest.outstanding_eod : 0,
    daily: serializeDaily(rows),
  };
}

// ── Staff / HR ────────────────────────────────────────────────────────
async function getStaffAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, ["staff_present_count", "staff_on_leave_count"]);
  return { range: { from: isoDate(fromDate), to: isoDate(toDate) }, totals, daily: serializeDaily(rows) };
}

// ── Patient ───────────────────────────────────────────────────────────
async function getPatientAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await fetchDailyRows(tenantId, fromDate, toDate);
  const totals = sumFields(rows, ["patients_new", "patients_returning"]);
  return { range: { from: isoDate(fromDate), to: isoDate(toDate) }, totals, daily: serializeDaily(rows) };
}

// ── Integration (external providers) ────────────────────────────────
async function getIntegrationAnalytics(tenantId, rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  return {
    range: { from: isoDate(fromDate), to: isoDate(toDate) },
    outbound: aggregateDimension(await fetchDimensionRows(tenantId, fromDate, toDate, "PROVIDER_OUTBOUND")),
    inbound: aggregateDimension(await fetchDimensionRows(tenantId, fromDate, toDate, "PROVIDER_INBOUND")),
  };
}

// ── Platform (Super Admin, cross-tenant) ────────────────────────────
async function getPlatformAnalytics(rangeOpts) {
  const { fromDate, toDate } = resolveDateRange(rangeOpts);
  const rows = await prisma.analytics_daily_tenant.findMany({
    where: { metric_date: { gte: fromDate, lte: toDate } },
    orderBy: { metric_date: "asc" },
  });
  const totals = sumFields(rows, ["revenue_total", "collections_total", "opd_visits", "admissions", "consultations", "patients_new"]);
  const byTenant = new Map();
  for (const r of rows) {
    const k = String(r.tenant_id);
    const cur = byTenant.get(k) || { tenantId: Number(r.tenant_id), revenue: 0, opdVisits: 0, admissions: 0 };
    cur.revenue += Number(r.revenue_total || 0);
    cur.opdVisits += r.opd_visits;
    cur.admissions += r.admissions;
    byTenant.set(k, cur);
  }
  const runs = await prisma.analytics_rollup_runs.findMany({ orderBy: { created_at: "desc" }, take: 10 });
  return {
    range: { from: isoDate(fromDate), to: isoDate(toDate) },
    totals,
    byTenant: [...byTenant.values()].sort((a, b) => b.revenue - a.revenue),
    recentRollupRuns: runs.map((r) => ({
      id: Number(r.id),
      rollupDate: isoDate(r.rollup_date),
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      lastError: r.last_error,
    })),
  };
}

module.exports = {
  resolveDateRange,
  getOperationsAnalytics,
  getClinicalAnalytics,
  getPharmacyAnalytics,
  getLabAnalytics,
  getRadiologyAnalytics,
  getBillingAnalytics,
  getStaffAnalytics,
  getPatientAnalytics,
  getIntegrationAnalytics,
  getPlatformAnalytics,
};
