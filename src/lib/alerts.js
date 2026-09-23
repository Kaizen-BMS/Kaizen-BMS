"use strict";

/**
 * Alerts & Notifications Center — the next major phase after Workflow
 * Automation (Phase 9). `NotificationBell.jsx`'s existing live feed only
 * ever showed a handful of ephemeral "something just happened" events
 * (resets on reload, no concept of "this needs attention"). This is a
 * genuinely different, complementary concept: a small, computed-on-demand
 * summary of business conditions that are ALREADY tracked elsewhere in
 * this product but had nowhere central to surface — low pharmacy stock,
 * expiring batches, a FAILED/WAITING workflow (Phase 9), a leave request
 * awaiting a decision. Deliberately NOT a new persisted "notifications"
 * table: every number here comes from a live query against data this
 * product already computes and already trusts, the same "zero fabricated
 * numbers" discipline the Dashboard widgets follow — and it means this
 * phase needs zero new migrations, zero new schema risk.
 *
 * Every category is independently optional, following the exact same
 * role/module-gating shape as `src/lib/dashboard/registry.js`'s
 * `visibleWidgets()` — a category simply isn't present in the response
 * when it doesn't apply to this viewer, never an empty/fake section.
 */
const { can } = require("./rbac");
const { getDefaultInstance } = require("./moduleInstances");
const { computeMedicineAlerts } = require("./pharmacyAlerts");

async function getPharmacyAlerts(db, tenantId) {
  const instance = await getDefaultInstance(db, tenantId, "PHARMACY");
  if (!instance) return null;
  const [batches, thresholds] = await Promise.all([
    db.pharmacy_stock.findMany({ where: { module_instance_id: instance.id } }),
    db.pharmacy_thresholds.findMany({ select: { medicine_name: true, low_stock_threshold: true } }),
  ]);
  const medicines = computeMedicineAlerts(batches, thresholds);
  const lowStock = medicines.filter((m) => m.lowStock);
  const expiringSoon = medicines.filter((m) => m.batches.some((b) => b.expiringSoon && !b.expired));
  const expired = medicines.filter((m) => m.batches.some((b) => b.expired));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = (d) => Math.round((new Date(d) - today) / 86400000);

  // Three genuinely separate categories — never merged into one generic
  // "pharmacy has issues" notice (CLAUDE.md-style discipline: each is its
  // own card with its own example detail and its own "view" target).
  return {
    instanceName: instance.name,
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 5).map((m) => ({ medicineName: m.medicineName, totalQuantity: m.totalQuantity, threshold: m.threshold })),
    expiringSoonCount: expiringSoon.length,
    expiringSoon: expiringSoon.slice(0, 5).flatMap((m) =>
      m.batches.filter((b) => b.expiringSoon && !b.expired).map((b) => ({ medicineName: m.medicineName, batch: b.batch_number, expiryDate: b.expiry_date, daysRemaining: daysLeft(b.expiry_date) })),
    ).slice(0, 5),
    expiredCount: expired.length,
    expired: expired.slice(0, 5).flatMap((m) =>
      m.batches.filter((b) => b.expired).map((b) => ({ medicineName: m.medicineName, batch: b.batch_number, expiredOn: b.expiry_date, quantity: b.quantity })),
    ).slice(0, 5),
  };
}

async function getWorkflowAlerts(db, tenantId) {
  const [failed, waiting] = await Promise.all([
    db.workflow_instances.findMany({
      where: { tenant_id: BigInt(tenantId), status: "FAILED" },
      orderBy: { failed_at: "desc" },
      take: 5,
      select: { id: true, definition_code: true, reference_type: true, reference_id: true, last_error: true },
    }),
    db.workflow_instances.count({ where: { tenant_id: BigInt(tenantId), status: "WAITING" } }),
  ]);
  if (failed.length === 0 && waiting === 0) return { failedCount: 0, waitingCount: 0, failed: [] };
  return {
    failedCount: failed.length,
    waitingCount: waiting,
    failed: failed.map((w) => ({
      id: Number(w.id),
      definitionCode: w.definition_code,
      referenceType: w.reference_type,
      referenceId: Number(w.reference_id),
      lastError: w.last_error,
    })),
  };
}

async function getRadiologyAlerts(db, tenantId) {
  const pending = await db.radiology_orders.findMany({
    where: { tenant_id: BigInt(tenantId), status: { in: ["ORDERED", "SCHEDULED"] } },
    orderBy: { created_at: "asc" },
    take: 5,
    select: { id: true, study_name: true, status: true },
  });
  const pendingCount = await db.radiology_orders.count({
    where: { tenant_id: BigInt(tenantId), status: { in: ["ORDERED", "SCHEDULED"] } },
  });
  if (pendingCount === 0) return { pendingCount: 0, pending: [] };
  return {
    pendingCount,
    pending: pending.map((o) => ({ id: Number(o.id), studyName: o.study_name, status: o.status })),
  };
}

async function getLeaveRequestAlerts(db, tenantId) {
  const pending = await db.leave_requests.findMany({
    where: { tenant_id: BigInt(tenantId), status: "PENDING" },
    orderBy: { created_at: "asc" },
    take: 5,
    include: { users_leave_requests_user_idTousers: { select: { name: true } } },
  });
  return {
    pendingCount: pending.length,
    pending: pending.map((r) => ({
      id: Number(r.id),
      userName: r.users_leave_requests_user_idTousers?.name || null,
      fromDate: r.from_date,
      toDate: r.to_date,
    })),
  };
}

/**
 * `ctx` = { session: {tenantId, role}, tenantType, activeModules }.
 * SUPER_ADMIN (session.tenantId === null) gets an empty response — these
 * are tenant-operational alerts, not a platform-wide concept; the
 * Platform section of the product already has its own screens for that
 * scope (CLAUDE.md "Super Admin").
 */
async function getAlerts(db, { session, tenantType, activeModules }) {
  if (session.tenantId == null) return { categories: {} };
  const active = new Set(activeModules || []);
  const categories = {};

  if (active.has("PHARMACY") && can(session.role, "stock:read")) {
    const pharmacy = await getPharmacyAlerts(db, session.tenantId);
    if (pharmacy) categories.pharmacy = pharmacy;
  }

  if (can(session.role, "workflow:read")) {
    const workflows = await getWorkflowAlerts(db, session.tenantId);
    categories.workflows = workflows;
  }

  if (active.has("RADIOLOGY") && can(session.role, "radiology:manage")) {
    const radiology = await getRadiologyAlerts(db, session.tenantId);
    categories.radiology = radiology;
  }

  if (tenantType === "HOSPITAL" && can(session.role, "staff:manage")) {
    const leaveRequests = await getLeaveRequestAlerts(db, session.tenantId);
    categories.leaveRequests = leaveRequests;
  }

  // Connection requests from other organizations waiting for THIS facility's decision (persisted — survives offline).
  if (can(session.role, "partner:manage")) {
    const { pendingIncoming } = require("./partners");
    const rows = await pendingIncoming(session.tenantId);
    if (rows.length > 0) {
      categories.partnerRequests = { pendingCount: rows.length, items: rows.slice(0, 5).map((r) => ({ id: r.id, from: r.counterparty?.name, service: r.serviceLabel })) };
    }
  }

  return { categories };
}

module.exports = { getAlerts };
