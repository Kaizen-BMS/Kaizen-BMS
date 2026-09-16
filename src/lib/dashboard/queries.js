"use strict";

/**
 * Dashboard query layer — real database data only, no invented numbers.
 * Every function here takes `tenantDb` explicitly (never imports it
 * itself) so it works correctly whether called from the dashboard API
 * route (tenant-scoped, via apiRoute()'s AsyncLocalStorage context) —
 * every function is tenant-scoped through `tenantDb`'s auto-injection,
 * never a bare `prisma` call for tenant data (see CLAUDE.md "Dashboard —
 * widget-driven overview"). `getPlatformOverview()` is the one deliberate
 * exception — SUPER_ADMIN has no single tenant to scope by, so it takes
 * the raw `prisma` client instead, matching every other Super Admin
 * screen in this app.
 */

const { getDefaultInstance } = require("../moduleInstances");

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}
function daysAgo(n, from = new Date()) {
  const d = startOfDay(from);
  d.setDate(d.getDate() - n);
  return d;
}
function dateKey(d) {
  return d.toISOString().slice(0, 10);
}
function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

/** The 8 KPI cards — each entry omitted entirely (not zeroed) if its module isn't active, so the frontend just checks presence rather than reading a meaningless 0. */
async function getKpis(tenantDb, { activeModules }) {
  const active = new Set(activeModules);
  const today = startOfDay();
  const tomorrow = endOfDay();
  const jobs = {};

  jobs.patientsToday = tenantDb.patients.count({ where: { created_at: { gte: today, lt: tomorrow } } });
  jobs.opdVisitsToday = tenantDb.visits.count({ where: { created_at: { gte: today, lt: tomorrow }, entry_type: "OPD" } });
  jobs.emergencyVisitsToday = tenantDb.visits.count({ where: { created_at: { gte: today, lt: tomorrow }, entry_type: "EMERGENCY" } });

  if (active.has("APPOINTMENTS")) {
    jobs.appointmentsToday = tenantDb.appointments.count({ where: { slot_time: { gte: today, lt: tomorrow } } });
  }
  if (active.has("IPD")) {
    jobs.currentAdmissions = tenantDb.admissions.count({ where: { discharged_at: null } });
    jobs.availableBeds = tenantDb.beds.count({ where: { status: "VACANT" } });
  }
  if (active.has("LAB")) {
    jobs.pendingLabOrders = tenantDb.lab_orders.count({ where: { status: { in: ["ORDERED", "IN_PROGRESS"] } } });
  }
  if (active.has("BILLING")) {
    jobs.todaysCollection = tenantDb.payments
      .aggregate({ _sum: { amount: true }, where: { paid_at: { gte: today, lt: tomorrow } } })
      .then((r) => toNumber(r._sum.amount));
  }

  const keys = Object.keys(jobs);
  const values = await Promise.all(keys.map((k) => jobs[k]));
  const out = {};
  keys.forEach((k, i) => (out[k] = toNumber(values[i])));
  return out;
}

/** Registrations / OPD / Emergency / admissions today. Always available — Patient/Registration is a core feature, not module-gated. */
async function getPatientFlow(tenantDb) {
  const today = startOfDay();
  const tomorrow = endOfDay();
  const [registrations, opd, emergency, admissions] = await Promise.all([
    tenantDb.patients.count({ where: { created_at: { gte: today, lt: tomorrow } } }),
    tenantDb.visits.count({ where: { created_at: { gte: today, lt: tomorrow }, entry_type: "OPD" } }),
    tenantDb.visits.count({ where: { created_at: { gte: today, lt: tomorrow }, entry_type: "EMERGENCY" } }),
    tenantDb.visits.count({ where: { created_at: { gte: today, lt: tomorrow }, entry_type: "DIRECT_ADMISSION" } }),
  ]);
  return { registrations, opd, emergency, admissions };
}

/** Scheduled/completed/pending/cancelled appointments today — only meaningful when APPOINTMENTS is active. */
async function getAppointmentsToday(tenantDb) {
  const today = startOfDay();
  const tomorrow = endOfDay();
  const rows = await tenantDb.appointments.groupBy({
    by: ["status"],
    _count: true,
    where: { slot_time: { gte: today, lt: tomorrow } },
  });
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count]));
  return {
    scheduled: (byStatus.BOOKED || 0) + (byStatus.CONFIRMED || 0),
    completed: byStatus.COMPLETED || 0,
    pending: byStatus.BOOKED || 0,
    cancelled: byStatus.CANCELLED || 0,
    noShow: byStatus.NO_SHOW || 0,
  };
}

/** Occupied/available/maintenance beds + today's admissions/discharges. */
async function getIpdStatus(tenantDb) {
  const today = startOfDay();
  const tomorrow = endOfDay();
  const [occupied, available, maintenance, cleaning, admissionsToday, dischargesToday] = await Promise.all([
    tenantDb.beds.count({ where: { status: "OCCUPIED" } }),
    tenantDb.beds.count({ where: { status: "VACANT" } }),
    tenantDb.beds.count({ where: { status: "MAINTENANCE" } }),
    tenantDb.beds.count({ where: { status: "CLEANING" } }),
    tenantDb.admissions.count({ where: { admitted_at: { gte: today, lt: tomorrow } } }),
    tenantDb.admissions.count({ where: { discharged_at: { gte: today, lt: tomorrow } } }),
  ]);
  return { occupied, available, maintenance, cleaning, admissionsToday, dischargesToday };
}

/**
 * Pharmacy status for the tenant's DEFAULT instance only (see CLAUDE.md
 * "Multiple Pharmacy instances" — no cross-instance aggregation is
 * attempted; showing the default instance is the explicitly preferred
 * fallback when aggregation isn't straightforward). Returns `null` if
 * the tenant has no Pharmacy instance at all (shouldn't happen once the
 * module is active, but defensive).
 */
async function getPharmacyStatus(tenantDb, tenantId) {
  const instance = await getDefaultInstance(tenantDb, tenantId, "PHARMACY");
  if (!instance) return null;

  const today = startOfDay();
  const tomorrow = endOfDay();
  const warnBy = new Date();
  warnBy.setDate(warnBy.getDate() + 30); // same EXPIRY_WARNING_DAYS as the Pharmacy inventory screen

  const [batches, thresholds, dispensedToday, pendingFulfillment] = await Promise.all([
    tenantDb.pharmacy_stock.findMany({ where: { module_instance_id: instance.id }, select: { medicine_name: true, quantity: true, expiry_date: true } }),
    tenantDb.pharmacy_thresholds.findMany({ select: { medicine_name: true, low_stock_threshold: true } }),
    tenantDb.pharmacy_stock_movements.count({
      where: { type: "DISPENSE", created_at: { gte: today, lt: tomorrow }, pharmacy_stock: { module_instance_id: instance.id } },
    }),
    tenantDb.prescription_items.count({ where: { status: { in: ["PENDING", "OUT_OF_STOCK"] } } }),
  ]);

  const thresholdMap = new Map(thresholds.map((t) => [t.medicine_name, t.low_stock_threshold]));
  const totals = new Map();
  let nearExpiry = 0;
  for (const b of batches) {
    totals.set(b.medicine_name, (totals.get(b.medicine_name) || 0) + b.quantity);
    if (b.expiry_date && b.expiry_date >= today && b.expiry_date <= warnBy) nearExpiry++;
  }
  let lowStock = 0;
  for (const [name, total] of totals) {
    if (total <= (thresholdMap.get(name) ?? 10)) lowStock++;
  }

  return { instanceName: instance.name, lowStock, nearExpiry, dispensedToday, pendingFulfillment };
}

/** Pending orders / results awaiting entry / completed today. */
async function getLabStatus(tenantDb) {
  const today = startOfDay();
  const tomorrow = endOfDay();
  const [pendingOrders, resultsPending, completedToday] = await Promise.all([
    tenantDb.lab_orders.count({ where: { status: "ORDERED" } }),
    tenantDb.lab_orders.count({ where: { status: "IN_PROGRESS" } }),
    tenantDb.lab_orders.count({ where: { status: "RESULTED", resulted_at: { gte: today, lt: tomorrow } } }),
  ]);
  return { pendingOrders, resultsPending, completedToday };
}

/**
 * Bills created / payments received / pending amount / today's collection.
 * `pendingAmount` reuses the EXACT same "owed minus net paid" formula
 * `src/lib/billing.js`'s `recomputeBillStatus()` already keeps
 * `bills.total_amount` in sync with (owed = items − discounts, floored at
 * 0) — never a separately-invented calculation. No GST/tariff math here
 * at all (CLAUDE.md "Financial data warning" — that catalog doesn't
 * exist yet).
 */
async function getBillingStatus(tenantDb) {
  const today = startOfDay();
  const tomorrow = endOfDay();
  const [billsToday, paymentsToday, paymentsTodaySum, openBills] = await Promise.all([
    tenantDb.bills.count({ where: { created_at: { gte: today, lt: tomorrow } } }),
    tenantDb.payments.count({ where: { paid_at: { gte: today, lt: tomorrow } } }),
    tenantDb.payments.aggregate({ _sum: { amount: true }, where: { paid_at: { gte: today, lt: tomorrow } } }),
    tenantDb.bills.findMany({
      where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } },
      select: { total_amount: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } } },
    }),
  ]);
  const pendingAmount = openBills.reduce((sum, b) => {
    const paid = b.payments.reduce((s, p) => s + toNumber(p.amount), 0);
    const refunded = b.refunds.reduce((s, r) => s + toNumber(r.amount), 0);
    const netPaid = paid - refunded;
    return sum + Math.max(0, toNumber(b.total_amount) - netPaid);
  }, 0);
  return {
    billsCreatedToday: billsToday,
    paymentsToday,
    todaysCollection: toNumber(paymentsTodaySum._sum.amount),
    pendingAmount,
    openBillCount: openBills.length,
  };
}

/** Bucket a list of `{ ts, value }` pairs into per-day totals across the given day keys. */
function bucketByDay(rows, dayKeys) {
  const buckets = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  for (const { ts, value } of rows) {
    const k = dateKey(ts);
    if (k in buckets) buckets[k] += value;
  }
  return dayKeys.map((k) => ({ date: k, value: buckets[k] }));
}

/**
 * 7-day trend charts — capped to the tenant's actual age so a brand-new
 * tenant never shows padded/fake history (CLAUDE.md "no fake data"). Real
 * zero counts for a quiet day are shown as 0, which is honest data, not
 * a gap to hide. Small bounded `findMany`s (at most 7 days of one
 * tenant's rows) bucketed in JS, rather than raw SQL — `tenantDb`'s
 * auto-scoping doesn't cover raw queries, and a 7-day window is small
 * enough that fetching-then-bucketing is simpler and just as fast.
 */
async function getWeeklyCharts(tenantDb, { tenantCreatedAt, activeModules }) {
  const active = new Set(activeModules);
  const maxDays = 7;
  const tenantAgeDays = Math.floor((startOfDay() - startOfDay(tenantCreatedAt)) / 86400000);
  const span = Math.max(1, Math.min(maxDays, tenantAgeDays + 1));
  const dayKeys = [];
  for (let i = span - 1; i >= 0; i--) dayKeys.push(dateKey(daysAgo(i)));
  const since = daysAgo(span - 1);

  const [visits, appointments, payments] = await Promise.all([
    tenantDb.visits.findMany({ where: { created_at: { gte: since } }, select: { created_at: true } }),
    active.has("APPOINTMENTS")
      ? tenantDb.appointments.findMany({ where: { created_at: { gte: since } }, select: { created_at: true } })
      : Promise.resolve(null),
    active.has("BILLING")
      ? tenantDb.payments.findMany({ where: { paid_at: { gte: since } }, select: { paid_at: true, amount: true } })
      : Promise.resolve(null),
  ]);

  return {
    patientVisits: bucketByDay(visits.map((v) => ({ ts: v.created_at, value: 1 })), dayKeys),
    appointments: appointments ? bucketByDay(appointments.map((a) => ({ ts: a.created_at, value: 1 })), dayKeys) : null,
    revenue: payments ? bucketByDay(payments.map((p) => ({ ts: p.paid_at, value: toNumber(p.amount) })), dayKeys) : null,
  };
}

/**
 * Recent activity — merged real rows across the domain tables, newest
 * first. Small bounded per-table fetches (last 5 each) rather than one
 * complex UNION query — simple, and fast enough at this data volume; a
 * genuine cross-module activity log is a later phase, not this one.
 */
async function getRecentActivity(tenantDb, { activeModules }, limit = 15) {
  const active = new Set(activeModules);
  const jobs = [
    tenantDb.patients.findMany({ orderBy: { created_at: "desc" }, take: 5, select: { id: true, name: true, created_at: true } })
      .then((rows) => rows.map((r) => ({ type: "PatientRegistered", label: `${r.name} registered`, at: r.created_at }))),
    tenantDb.visits.findMany({ orderBy: { created_at: "desc" }, take: 5, select: { id: true, entry_type: true, created_at: true } })
      .then((rows) => rows.map((r) => ({ type: "VisitCreated", label: `${r.entry_type} visit opened`, at: r.created_at }))),
    tenantDb.consultations.findMany({ orderBy: { created_at: "desc" }, take: 5, select: { id: true, diagnosis: true, created_at: true } })
      .then((rows) => rows.map((r) => ({ type: "ConsultationCompleted", label: r.diagnosis ? `Consultation — ${r.diagnosis}` : "Consultation recorded", at: r.created_at }))),
    tenantDb.prescriptions.findMany({ orderBy: { created_at: "desc" }, take: 5, select: { id: true, created_at: true } })
      .then((rows) => rows.map((r) => ({ type: "PrescriptionCreated", label: "Prescription created", at: r.created_at }))),
  ];
  if (active.has("APPOINTMENTS")) {
    jobs.push(
      tenantDb.appointments.findMany({ orderBy: { created_at: "desc" }, take: 5, select: { id: true, created_at: true, status: true } })
        .then((rows) => rows.map((r) => ({ type: "AppointmentBooked", label: `Appointment ${r.status.toLowerCase()}`, at: r.created_at }))),
    );
  }
  if (active.has("IPD")) {
    jobs.push(
      tenantDb.admissions.findMany({ orderBy: { admitted_at: "desc" }, take: 5, select: { id: true, admitted_at: true } })
        .then((rows) => rows.map((r) => ({ type: "AdmissionCreated", label: "Patient admitted", at: r.admitted_at }))),
      tenantDb.admissions.findMany({ where: { discharged_at: { not: null } }, orderBy: { discharged_at: "desc" }, take: 5, select: { id: true, discharged_at: true } })
        .then((rows) => rows.map((r) => ({ type: "DischargeCompleted", label: "Patient discharged", at: r.discharged_at }))),
    );
  }
  if (active.has("LAB")) {
    jobs.push(
      tenantDb.lab_orders.findMany({ where: { status: "RESULTED" }, orderBy: { resulted_at: "desc" }, take: 5, select: { id: true, resulted_at: true } })
        .then((rows) => rows.map((r) => ({ type: "LabResultEntered", label: "Lab result entered", at: r.resulted_at }))),
    );
  }
  if (active.has("PHARMACY")) {
    jobs.push(
      tenantDb.pharmacy_stock_movements.findMany({ where: { type: "DISPENSE" }, orderBy: { created_at: "desc" }, take: 5, select: { id: true, created_at: true } })
        .then((rows) => rows.map((r) => ({ type: "MedicineDispensed", label: "Medicine dispensed", at: r.created_at }))),
    );
  }
  if (active.has("BILLING")) {
    jobs.push(
      tenantDb.payments.findMany({ orderBy: { paid_at: "desc" }, take: 5, select: { id: true, amount: true, paid_at: true } })
        .then((rows) => rows.map((r) => ({ type: "PaymentReceived", label: `Payment received (₹${toNumber(r.amount)})`, at: r.paid_at }))),
    );
  }

  const results = await Promise.all(jobs);
  return results
    .flat()
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

/** SUPER_ADMIN platform dashboard — the one deliberate raw-`prisma` exception, matching every other Super Admin screen (there is no single tenant to scope by). */
async function getPlatformOverview(prisma) {
  const [totalTenants, activeTenants, byType, moduleInstanceCounts, recentTenants] = await Promise.all([
    prisma.tenants.count(),
    prisma.tenants.count({ where: { active: true } }),
    prisma.tenants.groupBy({ by: ["type"], _count: true }),
    prisma.module_instances.groupBy({ by: ["module_name", "status"], _count: true }),
    prisma.tenants.findMany({ orderBy: { created_at: "desc" }, take: 8, select: { id: true, name: true, type: true, active: true, created_at: true } }),
  ]);
  return {
    totalTenants,
    activeTenants,
    suspendedTenants: totalTenants - activeTenants,
    byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
    moduleInstances: moduleInstanceCounts.map((m) => ({ module: m.module_name, status: m.status, count: m._count })),
    recentTenants: recentTenants.map((t) => ({ id: Number(t.id), name: t.name, type: t.type, active: t.active, createdAt: t.created_at })),
  };
}

module.exports = {
  startOfDay,
  endOfDay,
  daysAgo,
  dateKey,
  toNumber,
  getKpis,
  getPatientFlow,
  getAppointmentsToday,
  getIpdStatus,
  getPharmacyStatus,
  getLabStatus,
  getBillingStatus,
  getWeeklyCharts,
  getRecentActivity,
  getPlatformOverview,
};
