"use strict";

/**
 * Core revenue/collection reports (Phase 7 — CLAUDE.md "Reports"). Every
 * function takes an explicit `tenantId` and does its own aggregation in
 * SQL (never loads a date range of rows into Node to sum in JS — CLAUDE.md
 * Phase 7 instruction #23). `payments`/`refunds`/`bill_items` have no
 * `tenant_id` column of their own (scoped transitively through `bills`,
 * same as `recomputeBillStatus()` and everywhere else this project joins
 * through them) — every query here filters by `bills.tenant_id = ?`
 * explicitly, the same discipline as every other raw query in this
 * codebase.
 *
 * Money fields returned here are the raw SQL SUM() results (MariaDB
 * returns an exact DECIMAL string via mysql2, never floating point) —
 * routes pass them straight through as-is, the same convention
 * `recomputeBillStatus()` already established for `total_amount`.
 */
const { Prisma } = require("@prisma/client");
const { tenantDb } = require("./prismaClient");

const { Decimal } = Prisma;

const MAX_RANGE_DAYS = 366;

/** Validate + clamp a date range — never an unbounded query (instruction #23). */
function resolveRange(from, to) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    const err = new Error("invalid_date_range");
    err.status = 400;
    throw err;
  }
  const days = (toDate - fromDate) / (24 * 60 * 60 * 1000);
  if (days < 0 || days > MAX_RANGE_DAYS) {
    const err = new Error(`date_range_too_wide (max ${MAX_RANGE_DAYS} days)`);
    err.status = 400;
    throw err;
  }
  // Inclusive end-of-day, matching how a human picks "date to" on a filter.
  const toExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
  return { fromDate, toExclusive };
}

/** REPORT 1 — Daily Collection: payments/refunds actually recorded in range. */
async function getCollectionReport(tenantId, { from, to, mode, doctorId } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  const doctorClause = doctorId
    ? "AND EXISTS (SELECT 1 FROM consultations c WHERE c.visit_id = b.visit_id AND c.doctor_id = ?)"
    : "";
  const modeClause = mode ? "AND p.mode = ?" : "";
  const params = [tenantId, fromDate, toExclusive];
  if (doctorId) params.push(BigInt(doctorId));
  if (mode) params.push(mode);

  const byMode = await tenantDb.$queryRawUnsafe(
    `SELECT p.mode AS mode, COALESCE(SUM(p.amount), 0) AS total, COUNT(*) AS count
       FROM payments p
       JOIN bills b ON b.id = p.bill_id
      WHERE b.tenant_id = ? AND p.paid_at >= ? AND p.paid_at < ?
        ${doctorClause} ${modeClause}
      GROUP BY p.mode`,
    ...params,
  );

  const [totals] = await tenantDb.$queryRawUnsafe(
    `SELECT COALESCE(SUM(p.amount), 0) AS collected, COUNT(DISTINCT p.bill_id) AS billsCount
       FROM payments p
       JOIN bills b ON b.id = p.bill_id
      WHERE b.tenant_id = ? AND p.paid_at >= ? AND p.paid_at < ?
        ${doctorClause} ${modeClause}`,
    ...params,
  );

  const refundParams = [tenantId, fromDate, toExclusive];
  if (doctorId) refundParams.push(BigInt(doctorId));
  const [refundTotals] = await tenantDb.$queryRawUnsafe(
    `SELECT COALESCE(SUM(r.amount), 0) AS refunded
       FROM refunds r
       JOIN bills b ON b.id = r.bill_id
      WHERE b.tenant_id = ? AND r.refunded_at >= ? AND r.refunded_at < ?
        ${doctorClause}`,
    ...refundParams,
  );

  return {
    from: fromDate.toISOString(),
    to: to || new Date().toISOString(),
    byMode,
    totalCollected: totals.collected,
    billsCount: Number(totals.billsCount),
    totalRefunded: refundTotals.refunded,
  };
}

/** REPORT 2 — Outstanding / Due: bills not yet fully paid, using bills.total_amount/status exactly as recomputeBillStatus() maintains them (never re-derived). */
async function getOutstandingReport(tenantId, { page = 1, pageSize = 25 } = {}) {
  const take = Math.min(Math.max(1, pageSize), 100);
  const skip = (Math.max(1, page) - 1) * take;

  const [total] = await tenantDb.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM bills WHERE tenant_id = ? AND status IN ('OPEN', 'PARTIALLY_PAID')`,
    tenantId,
  );

  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT b.id, b.bill_type, b.status, b.total_amount, b.created_at,
            p.name AS patient_name,
            COALESCE((SELECT SUM(amount) FROM payments WHERE bill_id = b.id), 0) AS paid,
            COALESCE((SELECT SUM(amount) FROM refunds WHERE bill_id = b.id), 0) AS refunded
       FROM bills b
       JOIN patients p ON p.id = b.patient_id
      WHERE b.tenant_id = ? AND b.status IN ('OPEN', 'PARTIALLY_PAID')
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?`,
    tenantId,
    take,
    skip,
  );

  return {
    bills: rows.map((r) => {
      // owed - netPaid, floored at 0 — the exact same formula
      // recomputeBillStatus() itself uses, applied here read-only (never
      // re-deriving bills.total_amount/status, only combining it with
      // paid/refunded to show what's actually still due). A first draft
      // of this line mistakenly returned the full owed amount as
      // "outstanding" — caught and fixed before this report shipped.
      const owed = new Decimal(r.total_amount);
      const netPaid = new Decimal(r.paid).minus(new Decimal(r.refunded));
      const outstanding = Decimal.max(0, owed.minus(netPaid));
      return {
        id: r.id,
        billType: r.bill_type,
        status: r.status,
        patientName: r.patient_name,
        createdAt: r.created_at,
        total: r.total_amount,
        paid: r.paid,
        refunded: r.refunded,
        outstanding: outstanding.toFixed(2),
      };
    }),
    total: Number(total.n),
    page,
    pageSize: take,
  };
}

/**
 * Shared shape for REPORTS 3/5/6 — revenue grouped by service within a
 * source. Deliberately billed-only, no "collected" column here: a
 * payment is recorded against the whole BILL, not a specific line item,
 * so any per-line "collected" figure here would only ever be an
 * approximation — worse than not showing one. Collections are already
 * covered precisely, at the bill level, by getCollectionReport().
 */
async function getSourceRevenue(tenantId, { from, to, sources }) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  const placeholders = sources.map(() => "?").join(",");
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT bi.source AS source, bi.service_id AS serviceId, s.name AS serviceName,
            COALESCE(SUM(bi.quantity), COUNT(*)) AS quantity,
            COALESCE(SUM(bi.amount), 0) AS billed
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       LEFT JOIN services s ON s.id = bi.service_id
      WHERE b.tenant_id = ? AND bi.source IN (${placeholders})
        AND b.created_at >= ? AND b.created_at < ?
      GROUP BY bi.source, bi.service_id, s.name
      ORDER BY billed DESC`,
    tenantId,
    ...sources,
    fromDate,
    toExclusive,
  );
  return rows.map((r) => ({
    source: r.source,
    serviceId: r.serviceId,
    serviceName: r.serviceName || "(unmapped / manually priced)",
    quantity: r.quantity,
    billed: r.billed,
  }));
}

/** REPORT 3 — OPD Revenue (consultation + service-priced OPD lines). */
async function getOpdRevenue(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT DATE(b.created_at) AS date, bi.description AS service, c.doctor_id AS doctorId,
            u.name AS doctorName, SUM(bi.quantity) AS quantity, SUM(bi.amount) AS revenue
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id AND b.bill_type = 'OPD'
       LEFT JOIN consultations c ON bi.reference_type = 'consultation' AND c.id = bi.reference_id
       LEFT JOIN users u ON u.id = c.doctor_id
      WHERE b.tenant_id = ? AND bi.source IN ('CONSULTATION', 'SERVICE')
        AND b.created_at >= ? AND b.created_at < ?
      GROUP BY DATE(b.created_at), bi.description, c.doctor_id, u.name
      ORDER BY date DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
  return rows;
}

/** REPORT 4 — IPD Revenue, per admission/bill. */
async function getIpdRevenue(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT b.id AS billId, b.status, b.total_amount AS billed, p.name AS patientName,
            b.created_at AS admittedBillingAt, b.finalized_at AS finalizedAt,
            COALESCE((SELECT SUM(amount) FROM payments WHERE bill_id = b.id), 0) AS collected
       FROM bills b
       JOIN patients p ON p.id = b.patient_id
      WHERE b.tenant_id = ? AND b.bill_type = 'IPD'
        AND b.created_at >= ? AND b.created_at < ?
      ORDER BY b.created_at DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
  return rows.map((r) => ({
    ...r,
    outstanding:
      Number(r.billed) - Number(r.collected) > 0 ? (Number(r.billed) - Number(r.collected)).toFixed(2) : "0.00",
  }));
}

/** REPORT 5 — Lab Revenue, by test/service. */
function getLabRevenue(tenantId, opts) {
  return getSourceRevenue(tenantId, { ...opts, sources: ["LAB"] }).then(async (unmapped) => {
    // LAB-sourced SERVICE lines (explicitly-mapped tests) are separate rows
    // from the un-mapped LAB ₹0 lines above — include both under one report,
    // distinguished by `serviceName` being present or the placeholder text.
    const { fromDate, toExclusive } = resolveRange(opts?.from, opts?.to);
    const mappedRows = await tenantDb.$queryRawUnsafe(
      `SELECT s.name AS serviceName, s.id AS serviceId, SUM(bi.quantity) AS quantity, SUM(bi.amount) AS billed
         FROM bill_items bi
         JOIN bills b ON b.id = bi.bill_id
         JOIN services s ON s.id = bi.service_id AND s.service_type = 'LAB'
        WHERE b.tenant_id = ? AND bi.source = 'SERVICE'
          AND b.created_at >= ? AND b.created_at < ?
        GROUP BY s.id, s.name
        ORDER BY billed DESC`,
      tenantId,
      fromDate,
      toExclusive,
    );
    return [...mappedRows.map((r) => ({ source: "SERVICE", ...r })), ...unmapped];
  });
}

/**
 * REPORT — Radiology Revenue, by study/service. Mirrors getLabRevenue()'s
 * exact shape (unmapped RADIOLOGY-sourced lines + explicitly-mapped
 * RADIOLOGY-type SERVICE lines) — the gap this task's own gap analysis
 * flagged (Radiology existed as a module, but had no revenue report the
 * way Lab/Pharmacy/OPD/IPD already did).
 */
function getRadiologyRevenue(tenantId, opts) {
  return getSourceRevenue(tenantId, { ...opts, sources: ["RADIOLOGY"] }).then(async (unmapped) => {
    const { fromDate, toExclusive } = resolveRange(opts?.from, opts?.to);
    const mappedRows = await tenantDb.$queryRawUnsafe(
      `SELECT s.name AS serviceName, s.id AS serviceId, SUM(bi.quantity) AS quantity, SUM(bi.amount) AS billed
         FROM bill_items bi
         JOIN bills b ON b.id = bi.bill_id
         JOIN services s ON s.id = bi.service_id AND s.service_type = 'RADIOLOGY'
        WHERE b.tenant_id = ? AND bi.source = 'SERVICE' AND bi.reference_type = 'radiology_order'
          AND b.created_at >= ? AND b.created_at < ?
        GROUP BY s.id, s.name
        ORDER BY billed DESC`,
      tenantId,
      fromDate,
      toExclusive,
    );
    return [...mappedRows.map((r) => ({ source: "SERVICE", ...r })), ...unmapped];
  });
}

/**
 * REPORT 6 — Pharmacy Sales, by medicine (module-instance breakdown via
 * dispense movements). Deliberately no per-line "refunded" column — a
 * refund is recorded against the whole BILL, not one line item, so (same
 * reasoning as getSourceRevenue()'s dropped "collected" column) any
 * per-line figure here would be misleading: it would attribute the same
 * bill-level refund to every pharmacy line on that bill, actually
 * double-counting it when a bill has more than one. A first draft of this
 * report did exactly that (an unconditional `JOIN refunds ON bill_id`)
 * and was caught and fixed before shipping.
 */
async function getPharmacyRevenue(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  // Two distinct paths land in Pharmacy revenue: (a) a prescription line
  // dispensed then billed at hospital checkout — no bi.stock_id of its own,
  // the batch is found via the dispense movement; (b) a direct walk-in
  // sale (Phase "pharmacy walk-in-sale") — bi.stock_id is set directly on
  // the line itself. COALESCE the two so neither path is silently dropped.
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT bi.description AS line, bi.source AS source, COALESCE(mi_direct.name, mi_rx.name) AS moduleInstance,
            COALESCE(SUM(bi.quantity), COUNT(*)) AS quantity, SUM(bi.amount) AS billed
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       LEFT JOIN pharmacy_stock ps_direct ON bi.reference_type = 'pharmacy_stock_movement' AND ps_direct.id = bi.stock_id
       LEFT JOIN module_instances mi_direct ON mi_direct.id = ps_direct.module_instance_id
       LEFT JOIN prescription_items pi ON bi.reference_type = 'prescription_item' AND pi.id = bi.reference_id
       LEFT JOIN pharmacy_stock_movements psm ON psm.prescription_item_id = pi.id AND psm.type = 'DISPENSE'
       LEFT JOIN pharmacy_stock ps_rx ON ps_rx.id = psm.stock_id
       LEFT JOIN module_instances mi_rx ON mi_rx.id = ps_rx.module_instance_id
      WHERE b.tenant_id = ? AND bi.source IN ('PHARMACY', 'SERVICE')
        AND bi.reference_type IN ('prescription_item', 'pharmacy_stock_movement')
        AND b.created_at >= ? AND b.created_at < ?
      GROUP BY bi.id, bi.description, bi.source, mi_direct.name, mi_rx.name
      ORDER BY billed DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
  return rows;
}

/** REPORT 7 — Doctor / Service Revenue. Only CONSULTATION-chain lines (a real, direct FK to a doctor) are ever attributed — never inferred. */
async function getDoctorRevenue(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  const rows = await tenantDb.$queryRawUnsafe(
    // `lines` is a MariaDB reserved word (LOAD DATA ... LINES) — aliased
    // as `line_count` instead; caught by a real syntax error (code 1064)
    // while verifying this report live, not by code review.
    `SELECT u.id AS doctorId, u.name AS doctorName, bi.description AS service,
            COUNT(*) AS line_count, SUM(bi.amount) AS revenue
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       JOIN consultations c ON bi.reference_type = 'consultation' AND c.id = bi.reference_id
       JOIN users u ON u.id = c.doctor_id
      WHERE b.tenant_id = ? AND bi.source IN ('CONSULTATION', 'SERVICE')
        AND b.created_at >= ? AND b.created_at < ?
      GROUP BY u.id, u.name, bi.description
      ORDER BY revenue DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
  return rows;
}

module.exports = {
  resolveRange,
  getCollectionReport,
  getOutstandingReport,
  getOpdRevenue,
  getIpdRevenue,
  getLabRevenue,
  getRadiologyRevenue,
  getPharmacyRevenue,
  getDoctorRevenue,
};
