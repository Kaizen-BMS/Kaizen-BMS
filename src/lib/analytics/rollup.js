"use strict";

/**
 * Analytics rollup — computes ONE tenant's ONE day of aggregate metrics
 * entirely in SQL (never loads a date range of rows into Node to sum —
 * same discipline as reports.js's own header comment) and UPSERTs into
 * analytics_daily_tenant / analytics_daily_dimension. Runs from
 * analyticsScheduler.js's interval loop, outside any request's
 * AsyncLocalStorage tenant context (same reason outboxProcessor.js uses
 * the raw `prisma` client with an explicit tenant_id on every query, never
 * `tenantDb`).
 *
 * Deliberately consolidated into exactly 2 fact tables (see migration 033's
 * own header comment) rather than one table per metric domain — this file
 * is the one place that width is assembled, in a handful of grouped
 * queries per domain, never a query per metric and never a query per row.
 */
const { prisma } = require("../prismaClient");

function toDateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayBounds(dateStr) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, dateOnly: dateStr };
}

async function one(rows, key, fallback = 0) {
  const row = rows && rows[0];
  if (!row) return fallback;
  const v = row[key];
  return v === null || v === undefined ? fallback : v;
}

/** Computes and upserts one tenant's one-day wide row. Returns the row written. */
async function rollupTenantDay(tenantId, dateStr) {
  const tid = BigInt(tenantId);
  const { start, end, dateOnly } = dayBounds(dateStr);

  const [
    patientsNewRows,
    patientsReturningRows,
    opdVisitsRows,
    admissionsRows,
    dischargesRows,
    losRows,
    apptBookedRows,
    apptOutcomeRows,
    consultationsRows,
    prescriptionsRows,
    labCreatedRows,
    labCompletedRows,
    labTurnaroundRows,
    labRevenueRows,
    radCreatedRows,
    radCompletedRows,
    radTurnaroundRows,
    radRevenueRows,
    pharmDispensedRows,
    pharmValueRows,
    billingRows,
    opdRevenueRows,
    ipdRevenueRows,
    outstandingRows,
    staffPresentRows,
    staffLeaveRows,
    bedsRows,
  ] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM patients WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT v.patient_id) AS n FROM visits v
        WHERE v.tenant_id = ? AND v.created_at >= ? AND v.created_at < ?
          AND EXISTS (SELECT 1 FROM visits v2 WHERE v2.tenant_id = v.tenant_id AND v2.patient_id = v.patient_id AND v2.created_at < ?)`,
      tid, start, end, start,
    ),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM visits WHERE tenant_id = ? AND entry_type = 'OPD' AND created_at >= ? AND created_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM admissions WHERE tenant_id = ? AND admitted_at >= ? AND admitted_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM admissions WHERE tenant_id = ? AND discharged_at >= ? AND discharged_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, admitted_at, discharged_at)) / 24 AS avg_days FROM admissions
        WHERE tenant_id = ? AND discharged_at >= ? AND discharged_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(
      `SELECT
          SUM(status = 'COMPLETED') AS completed,
          SUM(status = 'CANCELLED') AS cancelled,
          SUM(status = 'NO_SHOW') AS noshow
        FROM appointments WHERE tenant_id = ? AND slot_time >= ? AND slot_time < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM consultations WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM prescriptions WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM lab_orders WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM lab_orders WHERE tenant_id = ? AND resulted_at >= ? AND resulted_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, resulted_at)) / 60 AS avg_hours FROM lab_orders
        WHERE tenant_id = ? AND resulted_at >= ? AND resulted_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(bi.amount), 0) AS revenue FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
       WHERE b.tenant_id = ? AND bi.source IN ('LAB', 'SERVICE') AND bi.reference_type = 'lab_order'
         AND b.created_at >= ? AND b.created_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM radiology_orders WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM radiology_orders WHERE tenant_id = ? AND completed_at >= ? AND completed_at < ?`, tid, start, end),
    prisma.$queryRawUnsafe(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, completed_at)) / 60 AS avg_hours FROM radiology_orders
        WHERE tenant_id = ? AND completed_at >= ? AND completed_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(bi.amount), 0) AS revenue FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
       WHERE b.tenant_id = ? AND bi.source IN ('RADIOLOGY', 'SERVICE') AND bi.reference_type = 'radiology_order'
         AND b.created_at >= ? AND b.created_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(-psm.quantity_delta), 0) AS n FROM pharmacy_stock_movements psm
        WHERE psm.tenant_id = ? AND psm.type = 'DISPENSE' AND psm.created_at >= ? AND psm.created_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(bi.amount), 0) AS revenue FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
       WHERE b.tenant_id = ? AND bi.source IN ('PHARMACY', 'SERVICE') AND bi.reference_type = 'prescription_item'
         AND b.created_at >= ? AND b.created_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT
          COALESCE((SELECT SUM(bi.amount) FROM bill_items bi JOIN bills b ON b.id = bi.bill_id WHERE b.tenant_id = ? AND b.created_at >= ? AND b.created_at < ?), 0) AS revenue_total,
          COALESCE((SELECT SUM(bi.tax_amount) FROM bill_items bi JOIN bills b ON b.id = bi.bill_id WHERE b.tenant_id = ? AND b.created_at >= ? AND b.created_at < ?), 0) AS tax_total,
          COALESCE((SELECT SUM(p.amount) FROM payments p JOIN bills b ON b.id = p.bill_id WHERE b.tenant_id = ? AND p.paid_at >= ? AND p.paid_at < ?), 0) AS collections_total,
          COALESCE((SELECT SUM(r.amount) FROM refunds r JOIN bills b ON b.id = r.bill_id WHERE b.tenant_id = ? AND r.refunded_at >= ? AND r.refunded_at < ?), 0) AS refunds_total,
          COALESCE((SELECT SUM(d.amount) FROM discounts d JOIN bills b ON b.id = d.bill_id WHERE b.tenant_id = ? AND d.created_at >= ? AND d.created_at < ?), 0) AS discounts_total`,
      tid, start, end, tid, start, end, tid, start, end, tid, start, end, tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(bi.amount), 0) AS revenue FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
       WHERE b.tenant_id = ? AND b.bill_type = 'OPD' AND b.created_at >= ? AND b.created_at < ?`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(bi.amount), 0) AS revenue FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
       WHERE b.tenant_id = ? AND b.bill_type = 'IPD' AND b.created_at >= ? AND b.created_at < ?`,
      tid, start, end,
    ),
    // Snapshot (not date-scoped flow) — total currently outstanding across
    // every open bill, stored as "as-of this rollup date" — same
    // owed-minus-netPaid formula reports.js's getOutstandingReport() uses.
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(GREATEST(0, b.total_amount - COALESCE(pay.paid, 0) + COALESCE(ref.refunded, 0))), 0) AS outstanding
         FROM bills b
         LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM payments GROUP BY bill_id) pay ON pay.bill_id = b.id
         LEFT JOIN (SELECT bill_id, SUM(amount) AS refunded FROM refunds GROUP BY bill_id) ref ON ref.bill_id = b.id
        WHERE b.tenant_id = ? AND b.status IN ('OPEN', 'PARTIALLY_PAID')`,
      tid,
    ),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM attendance_logs WHERE tenant_id = ? AND work_date = ? AND check_in_at IS NOT NULL`, tid, dateOnly),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM leave_requests WHERE tenant_id = ? AND status = 'APPROVED' AND from_date <= ? AND to_date >= ?`, tid, dateOnly, dateOnly),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total, SUM(status = 'OCCUPIED') AS occupied FROM beds WHERE tenant_id = ?`, tid),
  ]);

  const bedsTotal = Number(await one(bedsRows, "total", 0));
  const bedsOccupied = Number(await one(bedsRows, "occupied", 0));
  const apptOutcome = apptOutcomeRows[0] || {};
  const billing = billingRows[0] || {};

  const data = {
    patients_new: Number(await one(patientsNewRows, "n")),
    patients_returning: Number(await one(patientsReturningRows, "n")),
    opd_visits: Number(await one(opdVisitsRows, "n")),
    admissions: Number(await one(admissionsRows, "n")),
    discharges: Number(await one(dischargesRows, "n")),
    avg_los_days: await one(losRows, "avg_days", null),
    appointments_booked: Number(await one(apptBookedRows, "n")),
    appointments_completed: Number(apptOutcome.completed || 0),
    appointments_cancelled: Number(apptOutcome.cancelled || 0),
    appointments_noshow: Number(apptOutcome.noshow || 0),
    consultations: Number(await one(consultationsRows, "n")),
    prescriptions_created: Number(await one(prescriptionsRows, "n")),
    lab_orders_created: Number(await one(labCreatedRows, "n")),
    lab_orders_completed: Number(await one(labCompletedRows, "n")),
    lab_revenue: await one(labRevenueRows, "revenue", 0),
    lab_avg_turnaround_hours: await one(labTurnaroundRows, "avg_hours", null),
    radiology_orders_created: Number(await one(radCreatedRows, "n")),
    radiology_orders_completed: Number(await one(radCompletedRows, "n")),
    radiology_revenue: await one(radRevenueRows, "revenue", 0),
    radiology_avg_turnaround_hours: await one(radTurnaroundRows, "avg_hours", null),
    pharmacy_items_dispensed: Number(await one(pharmDispensedRows, "n")),
    pharmacy_dispensed_value: await one(pharmValueRows, "revenue", 0),
    revenue_total: billing.revenue_total ?? 0,
    collections_total: billing.collections_total ?? 0,
    refunds_total: billing.refunds_total ?? 0,
    discounts_total: billing.discounts_total ?? 0,
    tax_total: billing.tax_total ?? 0,
    opd_revenue: await one(opdRevenueRows, "revenue", 0),
    ipd_revenue: await one(ipdRevenueRows, "revenue", 0),
    outstanding_eod: await one(outstandingRows, "outstanding", 0),
    staff_present_count: Number(await one(staffPresentRows, "n")),
    staff_on_leave_count: Number(await one(staffLeaveRows, "n")),
    beds_total: bedsTotal,
    beds_occupied: bedsOccupied,
    occupancy_pct: bedsTotal > 0 ? Number(((bedsOccupied / bedsTotal) * 100).toFixed(2)) : 0,
  };

  await prisma.analytics_daily_tenant.upsert({
    // Prisma's generated compound-unique field name is the default
    // column concatenation, not the migration's `map:` name — see
    // externalIdentifiers.js's mapExternalId() comment for the full
    // explanation (found and fixed the same bug there first).
    where: { tenant_id_metric_date: { tenant_id: tid, metric_date: new Date(dateOnly) } },
    update: { ...data, computed_at: new Date() },
    create: { tenant_id: tid, metric_date: new Date(dateOnly), ...data },
  });

  await rollupDimensions(tid, dateOnly, start, end);

  return data;
}

/** Doctor / Medicine / Ward / External-Provider breakdowns — one generic narrow table, reused across all four via dimension_type. */
async function rollupDimensions(tid, dateOnly, start, end) {
  const [doctorRows, medicineRows, wardRows, providerOutRows, providerInRows] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT c.doctor_id AS key_id, u.name AS label, COUNT(*) AS cnt, COALESCE(SUM(bi.amount), 0) AS revenue
         FROM consultations c
         JOIN users u ON u.id = c.doctor_id
         LEFT JOIN bill_items bi ON bi.reference_type = 'consultation' AND bi.reference_id = c.id
        WHERE c.tenant_id = ? AND c.created_at >= ? AND c.created_at < ?
        GROUP BY c.doctor_id, u.name`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT pi.medicine_name AS label, COALESCE(SUM(-psm.quantity_delta), 0) AS cnt, 0 AS revenue
         FROM pharmacy_stock_movements psm
         JOIN prescription_items pi ON pi.id = psm.prescription_item_id
        WHERE psm.tenant_id = ? AND psm.type = 'DISPENSE' AND psm.created_at >= ? AND psm.created_at < ?
        GROUP BY pi.medicine_name`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT ward_type AS label, COUNT(*) AS total, SUM(status = 'OCCUPIED') AS occupied
         FROM beds WHERE tenant_id = ? GROUP BY ward_type`,
      tid,
    ),
    prisma.$queryRawUnsafe(
      `SELECT ep.id AS key_id, ep.name AS label, COUNT(*) AS cnt
         FROM external_orders eo JOIN external_providers ep ON ep.id = eo.provider_id
        WHERE eo.tenant_id = ? AND eo.created_at >= ? AND eo.created_at < ?
        GROUP BY ep.id, ep.name`,
      tid, start, end,
    ),
    prisma.$queryRawUnsafe(
      `SELECT ep.id AS key_id, ep.name AS label, COUNT(*) AS cnt, SUM(we.status = 'FAILED') AS failed
         FROM webhook_events we JOIN external_providers ep ON ep.id = we.provider_id
        WHERE we.tenant_id = ? AND we.received_at >= ? AND we.received_at < ?
        GROUP BY ep.id, ep.name`,
      tid, start, end,
    ),
  ]);

  const upserts = [];
  for (const r of doctorRows) {
    upserts.push(dimRow(tid, dateOnly, "DOCTOR", String(r.key_id), r.label, Number(r.cnt), Number(r.revenue || 0)));
  }
  for (const r of medicineRows) {
    upserts.push(dimRow(tid, dateOnly, "MEDICINE", r.label, r.label, Number(r.cnt), 0));
  }
  for (const r of wardRows) {
    upserts.push(dimRow(tid, dateOnly, "WARD", r.label, r.label, Number(r.total), 0, Number(r.occupied || 0)));
  }
  for (const r of providerOutRows) {
    upserts.push(dimRow(tid, dateOnly, "PROVIDER_OUTBOUND", String(r.key_id), r.label, Number(r.cnt), 0));
  }
  for (const r of providerInRows) {
    upserts.push(dimRow(tid, dateOnly, "PROVIDER_INBOUND", String(r.key_id), r.label, Number(r.cnt), 0, Number(r.failed || 0)));
  }

  for (const u of upserts) {
    await prisma.analytics_daily_dimension.upsert({
      where: {
        tenant_id_metric_date_dimension_type_dimension_key: {
          tenant_id: u.tenant_id,
          metric_date: u.metric_date,
          dimension_type: u.dimension_type,
          dimension_key: u.dimension_key,
        },
      },
      update: { dimension_label: u.dimension_label, metric_count: u.metric_count, metric_value: u.metric_value, metric_secondary: u.metric_secondary, computed_at: new Date() },
      create: u,
    });
  }
}

function dimRow(tenantId, dateOnly, dimensionType, key, label, count, value, secondary = 0) {
  return {
    tenant_id: tenantId,
    metric_date: new Date(dateOnly),
    dimension_type: dimensionType,
    dimension_key: String(key).slice(0, 100),
    dimension_label: label ? String(label).slice(0, 191) : null,
    metric_count: count,
    metric_value: value,
    metric_secondary: secondary,
  };
}

/** Rolls up every active tenant for the given date. Returns { tenantCount, errors }. */
async function rollupAllTenants(dateStr) {
  const tenants = await prisma.tenants.findMany({ where: { active: true }, select: { id: true } });
  const rowCounts = {};
  let errors = 0;
  for (const t of tenants) {
    try {
      await rollupTenantDay(t.id, dateStr);
      rowCounts[String(t.id)] = "ok";
    } catch (err) {
      errors++;
      rowCounts[String(t.id)] = `error: ${String(err.message || err).slice(0, 200)}`;
      console.error(`[analytics] rollup failed for tenant ${t.id} on ${dateStr}:`, err);
    }
  }
  return { tenantCount: tenants.length, errors, rowCounts };
}

module.exports = { rollupTenantDay, rollupAllTenants, dayBounds };
