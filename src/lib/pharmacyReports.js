"use strict";

/**
 * Pharmacy reports — same discipline as src/lib/reports.js (Phase 7):
 * explicit tenantId, real SQL aggregation, a validated/capped date range
 * for anything date-ranged, current-snapshot for anything that isn't
 * (stock levels, valuation). Reuses resolveRange from reports.js rather
 * than duplicating it.
 */
const { tenantDb, prisma } = require("./prismaClient");
const { resolveRange } = require("./reports");
const { resolveInstance } = require("./moduleInstances");
const { EXPIRY_WARNING_DAYS } = require("./pharmacyConstants");

async function instanceOf(tenantId, moduleInstanceId) {
  return resolveInstance(tenantDb, tenantId, "PHARMACY", moduleInstanceId);
}

/** REPORT — Inventory Summary: current snapshot, by medicine type. */
async function getInventorySummary(tenantId, { moduleInstanceId } = {}) {
  const instance = await instanceOf(tenantId, moduleInstanceId);
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT COALESCE(m.medicine_type, 'Other') AS type, COUNT(DISTINCT ps.medicine_name) AS medicines,
            COUNT(*) AS batches, COALESCE(SUM(ps.quantity), 0) AS units,
            COALESCE(SUM(ps.quantity * COALESCE(ps.purchase_rate, 0)), 0) AS value
       FROM pharmacy_stock ps
       LEFT JOIN medicines m ON m.id = ps.medicine_id
      WHERE ps.tenant_id = ? AND ps.module_instance_id = ? AND ps.quantity > 0
      GROUP BY COALESCE(m.medicine_type, 'Other')
      ORDER BY value DESC`,
    tenantId,
    instance.id,
  );
  const totals = rows.reduce((a, r) => ({ medicines: a.medicines + Number(r.medicines), batches: a.batches + Number(r.batches), units: a.units + Number(r.units), value: a.value + Number(r.value) }), { medicines: 0, batches: 0, units: 0, value: 0 });
  return { instanceName: instance.name, byType: rows, totals };
}

/** REPORT — Expiry: every batch expiring within `days` (default the same 60-day window as the inventory alert) or already expired, oldest expiry first. */
async function getExpiryReport(tenantId, { moduleInstanceId, days } = {}) {
  const instance = await instanceOf(tenantId, moduleInstanceId);
  const warnDays = days ?? EXPIRY_WARNING_DAYS;
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT ps.id AS stockId, ps.medicine_name AS medicineName, ps.batch_number AS batchNumber, ps.expiry_date AS expiryDate,
            ps.quantity AS quantity, DATEDIFF(ps.expiry_date, CURDATE()) AS daysRemaining
       FROM pharmacy_stock ps
      WHERE ps.tenant_id = ? AND ps.module_instance_id = ? AND ps.quantity > 0 AND ps.expiry_date IS NOT NULL
        AND ps.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
      ORDER BY ps.expiry_date ASC`,
    tenantId,
    instance.id,
    warnDays,
  );
  return rows;
}

/** REPORT — Purchases: accepted GRN quantity/value by medicine, in range. */
async function getPurchaseReport(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  return tenantDb.$queryRawUnsafe(
    `SELECT m.name AS medicineName, SUM(gi.accepted_quantity) AS quantity,
            SUM(gi.accepted_quantity * gi.purchase_rate) AS value, COUNT(DISTINCT gi.grn_id) AS grnCount
       FROM grn_items gi
       JOIN grns g ON g.id = gi.grn_id
       JOIN medicines m ON m.id = gi.medicine_id
      WHERE gi.tenant_id = ? AND g.created_at >= ? AND g.created_at < ?
      GROUP BY m.id, m.name
      ORDER BY value DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
}

/** REPORT — GRNs in range, one row per GRN with its totals. */
async function getGrnReport(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  return tenantDb.$queryRawUnsafe(
    `SELECT g.id AS grnId, g.grn_number AS grnNumber, g.grn_date AS grnDate, s.name AS supplierName,
            COUNT(gi.id) AS lineCount, SUM(gi.accepted_quantity) AS acceptedQuantity,
            SUM(gi.accepted_quantity * gi.purchase_rate) AS value
       FROM grns g
       LEFT JOIN suppliers s ON s.id = g.supplier_id
       LEFT JOIN grn_items gi ON gi.grn_id = g.id
      WHERE g.tenant_id = ? AND g.created_at >= ? AND g.created_at < ?
      GROUP BY g.id, g.grn_number, g.grn_date, s.name
      ORDER BY g.grn_date DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
}

/** REPORT — Purchases grouped by supplier, in range. */
async function getSupplierPurchaseReport(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  return tenantDb.$queryRawUnsafe(
    `SELECT COALESCE(s.name, 'Unspecified') AS supplierName, COUNT(DISTINCT g.id) AS grnCount,
            SUM(gi.accepted_quantity) AS quantity, SUM(gi.accepted_quantity * gi.purchase_rate) AS value
       FROM grns g
       LEFT JOIN suppliers s ON s.id = g.supplier_id
       JOIN grn_items gi ON gi.grn_id = g.id
      WHERE g.tenant_id = ? AND g.created_at >= ? AND g.created_at < ?
      GROUP BY COALESCE(s.name, 'Unspecified')
      ORDER BY value DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
}

/** REPORT — Dispensing: every DISPENSE movement in range (prescription fulfilment AND walk-in/OTC sale alike), medicine + quantity + who. */
async function getDispensingReport(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  return tenantDb.$queryRawUnsafe(
    `SELECT psm.id AS movementId, psm.created_at AS at, ps.medicine_name AS medicineName, ps.batch_number AS batchNumber,
            ABS(psm.quantity_delta) AS quantity, u.name AS performedBy,
            CASE WHEN psm.prescription_item_id IS NOT NULL THEN 'Prescription' WHEN psm.reference_type = 'SALE' THEN 'Walk-in sale' ELSE 'Partner order' END AS via
       FROM pharmacy_stock_movements psm
       JOIN pharmacy_stock ps ON ps.id = psm.stock_id
       LEFT JOIN users u ON u.id = psm.performed_by
      WHERE psm.tenant_id = ? AND psm.type = 'DISPENSE' AND psm.created_at >= ? AND psm.created_at < ?
      ORDER BY psm.created_at DESC
      LIMIT 500`,
    tenantId,
    fromDate,
    toExclusive,
  );
}

/** REPORT — Stock Movement ledger, optionally filtered by type, in range. */
async function getStockMovementReport(tenantId, { from, to, type } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  const typeClause = type ? "AND psm.type = ?" : "";
  const params = [tenantId, fromDate, toExclusive];
  if (type) params.push(type);
  return tenantDb.$queryRawUnsafe(
    `SELECT psm.id AS movementId, psm.created_at AS at, psm.type AS type, ps.medicine_name AS medicineName,
            ps.batch_number AS batchNumber, psm.quantity_delta AS quantityDelta, psm.reason AS reason, u.name AS performedBy
       FROM pharmacy_stock_movements psm
       JOIN pharmacy_stock ps ON ps.id = psm.stock_id
       LEFT JOIN users u ON u.id = psm.performed_by
      WHERE psm.tenant_id = ? AND psm.created_at >= ? AND psm.created_at < ? ${typeClause}
      ORDER BY psm.created_at DESC
      LIMIT 500`,
    ...params,
  );
}

/** REPORT — Stock Adjustments (manual corrections: damaged / expired write-off / other), in range. */
function getStockAdjustmentReport(tenantId, opts) {
  // Reuses the movement ledger, narrowed to the adjustment-shaped types —
  // one query, not a second copy of the same join.
  return Promise.all(
    ["ADJUSTMENT", "DAMAGED", "EXPIRED_WRITEOFF"].map((type) => getStockMovementReport(tenantId, { ...opts, type })),
  ).then((groups) => groups.flat().sort((a, b) => new Date(b.at) - new Date(a.at)));
}

/** REPORT — Sales (customer) returns in range. */
async function getSalesReturnReport(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  return tenantDb.$queryRawUnsafe(
    `SELECT cr.id AS returnId, cr.created_at AS at, ps.medicine_name AS medicineName, ps.batch_number AS batchNumber,
            cr.quantity AS quantity, cr.reason AS reason, cr.refund_amount AS refundAmount, u.name AS createdBy
       FROM customer_returns cr
       LEFT JOIN pharmacy_stock ps ON ps.id = cr.stock_id
       LEFT JOIN users u ON u.id = cr.created_by
      WHERE cr.tenant_id = ? AND cr.created_at >= ? AND cr.created_at < ?
      ORDER BY cr.created_at DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
}

/** REPORT — Purchase (supplier) returns in range. */
async function getPurchaseReturnReport(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  return tenantDb.$queryRawUnsafe(
    `SELECT sr.id AS returnId, sr.created_at AS at, ps.medicine_name AS medicineName, ps.batch_number AS batchNumber,
            sr.quantity AS quantity, sr.reason AS reason, sup.name AS supplierName, u.name AS createdBy
       FROM supplier_returns sr
       LEFT JOIN pharmacy_stock ps ON ps.id = sr.stock_id
       LEFT JOIN suppliers sup ON sup.id = sr.supplier_id
       LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.tenant_id = ? AND sr.created_at >= ? AND sr.created_at < ?
      ORDER BY sr.created_at DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
}

/** REPORT — Stock Valuation: current snapshot, cost value (purchase rate) and MRP value per medicine, plus a grand total. */
async function getStockValuation(tenantId, { moduleInstanceId } = {}) {
  const instance = await instanceOf(tenantId, moduleInstanceId);
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT ps.medicine_name AS medicineName, SUM(ps.quantity) AS quantity,
            SUM(ps.quantity * COALESCE(ps.purchase_rate, 0)) AS costValue,
            SUM(ps.quantity * COALESCE(ps.mrp, 0)) AS mrpValue
       FROM pharmacy_stock ps
      WHERE ps.tenant_id = ? AND ps.module_instance_id = ? AND ps.quantity > 0
      GROUP BY ps.medicine_name
      ORDER BY costValue DESC`,
    tenantId,
    instance.id,
  );
  const totals = rows.reduce((a, r) => ({ quantity: a.quantity + Number(r.quantity), costValue: a.costValue + Number(r.costValue), mrpValue: a.mrpValue + Number(r.mrpValue) }), { quantity: 0, costValue: 0, mrpValue: 0 });
  return { instanceName: instance.name, rows, totals };
}

/**
 * REPORT — Medicine-wise Revenue: billed amount by medicine, in range.
 * Covers both real paths a pharmacy line can come from — a direct
 * walk-in/OTC sale (bi.stock_id set directly) and a prescription line
 * dispensed then billed at hospital checkout (found via the dispense
 * movement) — same two-path join as getPharmacyRevenue() in reports.js.
 */
async function getMedicineRevenue(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  return tenantDb.$queryRawUnsafe(
    `SELECT COALESCE(m_direct.name, ps_rx.medicine_name) AS medicineName,
            SUM(bi.quantity) AS quantity, SUM(bi.amount) AS revenue
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       LEFT JOIN pharmacy_stock ps_direct ON bi.reference_type = 'pharmacy_stock_movement' AND ps_direct.id = bi.stock_id
       LEFT JOIN medicines m_direct ON m_direct.id = ps_direct.medicine_id
       LEFT JOIN prescription_items pi ON bi.reference_type = 'prescription_item' AND pi.id = bi.reference_id
       LEFT JOIN pharmacy_stock_movements psm ON psm.prescription_item_id = pi.id AND psm.type = 'DISPENSE'
       LEFT JOIN pharmacy_stock ps_rx ON ps_rx.id = psm.stock_id
      WHERE b.tenant_id = ? AND bi.source IN ('PHARMACY', 'SERVICE')
        AND bi.reference_type IN ('prescription_item', 'pharmacy_stock_movement')
        AND b.created_at >= ? AND b.created_at < ?
      GROUP BY COALESCE(m_direct.name, ps_rx.medicine_name)
      ORDER BY revenue DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
}

/**
 * REPORT — Medicine-wise Margin: revenue minus real cost basis, in range.
 * Deliberately covers ONLY direct walk-in/OTC sale lines — those are the
 * only ones with a real per-line cost snapshot (bi.purchase_rate,
 * CLAUDE.md Phase-7-style "never invent a number you don't have a basis
 * for"). A prescription line billed at hospital checkout is one flat
 * manually-priced amount with no per-unit cost captured anywhere in this
 * system, so it is intentionally excluded rather than guessed at — the
 * report says so.
 */
async function getMedicineMargin(tenantId, { from, to } = {}) {
  const { fromDate, toExclusive } = resolveRange(from, to);
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT m.name AS medicineName, SUM(bi.quantity) AS quantity, SUM(bi.taxable_amount) AS revenue,
            SUM(bi.quantity * COALESCE(bi.purchase_rate, 0)) AS cost,
            SUM(bi.taxable_amount) - SUM(bi.quantity * COALESCE(bi.purchase_rate, 0)) AS margin
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       JOIN medicines m ON m.id = bi.medicine_id
      WHERE b.tenant_id = ? AND bi.reference_type = 'pharmacy_stock_movement' AND bi.purchase_rate IS NOT NULL
        AND b.created_at >= ? AND b.created_at < ?
      GROUP BY m.id, m.name
      ORDER BY margin DESC`,
    tenantId,
    fromDate,
    toExclusive,
  );
  return { rows, note: "Covers walk-in / counter sales only — a prescription line billed at hospital checkout has no per-unit cost captured to compute a real margin from." };
}

function dayBounds(dateStr) {
  const start = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  start.setHours(0, 0, 0, 0);
  if (Number.isNaN(start.getTime())) throw new Error("invalid_date");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * REPORT — Partner Sales: every partner-connection order this pharmacy
 * fulfilled on a given day (default today), grouped by connection/partner.
 * Sourced from `peer_inbound_orders` (PHARMACY_PRESCRIPTION, COMPLETED) —
 * the only record of a partner-fulfilled sale, since dispensing a partner
 * order only ever moves stock (pharmacy_stock_movements), it never creates
 * a bill on this pharmacy's own side (see CLAUDE.md "partner pharmacy
 * daily sales report"). `amount` is whatever the pharmacist optionally
 * reported back when completing the order — null when they didn't, never
 * invented.
 */
async function getPartnerSalesReport(tenantId, { date } = {}) {
  const { start, end } = dayBounds(date);
  const rows = await tenantDb.peer_inbound_orders.findMany({
    where: { order_type: "PHARMACY_PRESCRIPTION", status: "COMPLETED", completed_at: { gte: start, lt: end } },
    orderBy: { completed_at: "asc" },
  });
  const connIds = [...new Set(rows.map((r) => r.org_connection_id))];
  const conns = connIds.length
    ? await prisma.org_connections.findMany({ where: { id: { in: connIds } } })
    : [];
  const cmap = new Map(conns.map((c) => [String(c.id), c]));
  const tenantIds = [...new Set(conns.map((c) => c.requester_tenant_id))];
  const tenants = tenantIds.length
    ? await prisma.tenants.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
    : [];
  const tmap = new Map(tenants.map((t) => [String(t.id), t.name]));

  const groups = new Map();
  for (const r of rows) {
    const payload = JSON.parse(r.payload || "{}");
    const result = JSON.parse(r.result_payload || "{}");
    const conn = cmap.get(String(r.org_connection_id));
    const key = String(r.org_connection_id);
    if (!groups.has(key)) {
      groups.set(key, {
        connectionId: Number(r.org_connection_id),
        partnerName: conn ? tmap.get(String(conn.requester_tenant_id)) || "Unknown" : "Unknown",
        items: [],
        totalQuantity: 0,
        totalAmount: 0,
      });
    }
    const g = groups.get(key);
    const quantity = Number(result.quantityFulfilled ?? payload.quantity ?? 0);
    const amount = result.amount != null ? Number(result.amount) : null;
    g.items.push({
      ref: r.external_order_ref,
      medicineName: payload.medicineName || "—",
      quantity,
      amount,
      completedAt: r.completed_at,
    });
    g.totalQuantity += quantity;
    if (amount != null) g.totalAmount += amount;
  }
  return { date: start.toISOString().slice(0, 10), connections: [...groups.values()] };
}

module.exports = {
  getInventorySummary,
  getExpiryReport,
  getPurchaseReport,
  getGrnReport,
  getSupplierPurchaseReport,
  getDispensingReport,
  getStockMovementReport,
  getStockAdjustmentReport,
  getSalesReturnReport,
  getPurchaseReturnReport,
  getStockValuation,
  getMedicineRevenue,
  getMedicineMargin,
  getPartnerSalesReport,
};
