"use strict";

/**
 * IPD's running bill: created automatically at admission, appended to live
 * as pharmacy/lab charges happen during the stay, room charge + finalized
 * at discharge. This is the ONE place billing reaches into what another
 * module did — and it does it by subscribing to `realtime.js`'s
 * `serverEvents` bus, never by importing IPD/Pharmacy/Lab route code
 * directly (see CLAUDE.md "Billing module").
 *
 * Required once, at process start, from server.js — a side-effect module
 * (registers its listeners on require, exports nothing to call).
 */
const { serverEvents, emitToModule } = require("./realtime");
const { runWithContext } = require("./requestContext");
const { tenantDb } = require("./prismaClient");
const { resolveAndPriceService, resolvePatientCategory, money2 } = require("./pricing");
const { recomputeBillStatus } = require("./billing");

/** The tenant's single OPEN, not-yet-finalized IPD bill for this visit, or null. */
async function findOpenIpdBill(visitId) {
  return tenantDb.bills.findFirst({
    where: { visit_id: visitId, bill_type: "IPD", finalized_at: null },
  });
}

/**
 * Idempotent: never append the same source row to a bill twice.
 *
 * Phase 7 bug fix: this function previously created the bill_item and
 * emitted the update WITHOUT ever calling recomputeBillStatus() — so a
 * running IPD bill's total_amount/status stayed stuck at 0/OPEN no matter
 * how many pharmacy/lab/room charges accrued during the stay, until
 * (coincidentally) a payment route happened to recompute it. Found while
 * verifying Phase 7's own IPD room-charge integration (a real tariff-priced
 * ₹3,360 room charge left total_amount at "0"). Fixed here, the single
 * place every IPD running-bill append already funnels through — reusing
 * the exact same canonical function every other billing route already
 * calls, never a second/independent calculation (CLAUDE.md Phase 7
 * instruction #14).
 */
async function appendItemOnce(billId, tenantId, data) {
  const existing = await tenantDb.bill_items.findFirst({
    where: { bill_id: billId, reference_type: data.reference_type, reference_id: data.reference_id },
  });
  if (existing) return;
  await tenantDb.bill_items.create({ data: { bill_id: billId, ...data } });
  await recomputeBillStatus(tenantDb, billId);
  const bill = await tenantDb.bills.findUnique({
    where: { id: billId },
    include: { bill_items: true, payments: true, discounts: true, refunds: true },
  });
  emitToModule(tenantId, "BILLING", "bill:updated", { bill });
}

serverEvents.on("admission:created", ({ tenantId, payload }) => {
  runWithContext({ tenantId }, async () => {
    const admission = payload.admission;
    if (!admission?.visit_id || !admission?.patient_id) return;
    const already = await findOpenIpdBill(BigInt(admission.visit_id));
    if (already) return;
    const bill = await tenantDb.bills.create({
      data: {
        patient_id: BigInt(admission.patient_id),
        visit_id: BigInt(admission.visit_id),
        bill_type: "IPD",
      },
    });
    emitToModule(tenantId, "BILLING", "bill:created", { bill });
  }).catch((err) => console.error("billingEvents admission:created failed", err));
});

serverEvents.on("dispense:created", ({ tenantId, payload }) => {
  runWithContext({ tenantId }, async () => {
    const item = payload.item;
    if (!item) return;
    const rx = await tenantDb.prescriptions.findUnique({
      where: { id: BigInt(item.prescription_id) },
      select: { visit_id: true },
    });
    if (!rx?.visit_id) return;
    const bill = await findOpenIpdBill(rx.visit_id);
    if (!bill) return; // not an IPD stay (or no open running bill) — OPD pharmacy items are aggregated at checkout instead

    // Explicit mapping only (item.service_id) — same rule as OPD's
    // billing/opd route. No mapping -> the pre-Phase-7 amount:0 behavior.
    let priced = { ok: false };
    if (item.service_id) {
      const category = await resolvePatientCategory(tenantDb, bill.patient_id);
      priced = await resolveAndPriceService(tenantDb, item.service_id, category, item.dispensed_quantity);
    }
    await appendItemOnce(bill.id, tenantId, {
      source: priced.ok ? "SERVICE" : "PHARMACY",
      description: `${item.medicine_name} × ${item.dispensed_quantity}`,
      amount: priced.ok ? priced.line.amount : 0,
      reference_type: "prescription_item",
      reference_id: BigInt(item.id),
      ...(priced.ok
        ? {
            service_id: priced.service.id,
            tariff_id: priced.tariff.id,
            quantity: priced.line.quantity,
            unit_price: priced.line.unit_price,
            taxable_amount: priced.line.taxable_amount,
            tax_rate: priced.line.tax_rate,
            cgst_amount: priced.line.cgst_amount,
            sgst_amount: priced.line.sgst_amount,
            igst_amount: priced.line.igst_amount,
            tax_amount: priced.line.tax_amount,
          }
        : {}),
    });
  }).catch((err) => console.error("billingEvents dispense:created failed", err));
});

serverEvents.on("lab:result", ({ tenantId, payload }) => {
  runWithContext({ tenantId }, async () => {
    const labOrder = payload.labOrder;
    if (!labOrder?.visit_id) return;
    const bill = await findOpenIpdBill(BigInt(labOrder.visit_id));
    if (!bill) return;
    const tests = typeof labOrder.tests === "string" ? JSON.parse(labOrder.tests) : labOrder.tests || [];

    // Same explicit-mapping rule as OPD's billing/opd route: only tests
    // linked via lab_order_items (set at order time) get priced; anything
    // else falls back to the existing combined amount:0 LAB line.
    const mapped = await tenantDb.lab_order_items.findMany({
      where: { lab_order_id: BigInt(labOrder.id), service_id: { not: null } },
    });
    const mappedNames = new Set(mapped.map((m) => m.test_name));
    const unmapped = tests.filter((t) => !mappedNames.has(t));
    const category = mapped.length ? await resolvePatientCategory(tenantDb, bill.patient_id) : null;

    for (const li of mapped) {
      const priced = await resolveAndPriceService(tenantDb, li.service_id, category, li.quantity);
      if (!priced.ok) {
        unmapped.push(li.test_name);
        continue;
      }
      await appendItemOnce(bill.id, tenantId, {
        source: "SERVICE",
        description: li.test_name,
        amount: priced.line.amount,
        reference_type: "lab_order_item",
        reference_id: BigInt(li.id),
        service_id: priced.service.id,
        tariff_id: priced.tariff.id,
        quantity: priced.line.quantity,
        unit_price: priced.line.unit_price,
        taxable_amount: priced.line.taxable_amount,
        tax_rate: priced.line.tax_rate,
        cgst_amount: priced.line.cgst_amount,
        sgst_amount: priced.line.sgst_amount,
        igst_amount: priced.line.igst_amount,
        tax_amount: priced.line.tax_amount,
      });
    }
    if (unmapped.length) {
      await appendItemOnce(bill.id, tenantId, {
        source: "LAB",
        description: unmapped.join(", "),
        amount: 0,
        reference_type: "lab_order",
        reference_id: BigInt(labOrder.id),
      });
    }
  }).catch((err) => console.error("billingEvents lab:result failed", err));
});

serverEvents.on("admission:discharged", ({ tenantId, payload }) => {
  runWithContext({ tenantId }, async () => {
    const admission = payload.admission;
    if (!admission?.visit_id || !admission?.bed_id || !admission?.admitted_at || !admission?.discharged_at) return;
    const bill = await findOpenIpdBill(BigInt(admission.visit_id));
    if (!bill) return;

    const bed = await tenantDb.beds.findUnique({
      where: { id: BigInt(admission.bed_id) },
      select: { daily_rate: true, bed_number: true, service_id: true },
    });
    const admittedAt = new Date(admission.admitted_at);
    const dischargedAt = new Date(admission.discharged_at);
    const msPerDay = 24 * 60 * 60 * 1000;
    // Any part of a day counts as a full day — the usual hotel/ward billing convention.
    const nights = Math.max(1, Math.ceil((dischargedAt - admittedAt) / msPerDay));
    const label = `Room charge — bed ${bed?.bed_number || admission.bed_id} × ${nights} day${nights > 1 ? "s" : ""}`;

    // Preferred: the bed is linked to a ROOM-type Service — tariff-priced
    // (Decimal-safe, with GST). Falls back to the existing daily_rate ×
    // nights (plain, pre-Phase-7 Number math — unchanged, still the
    // default for every existing bed with no service link) when unlinked
    // or the tariff is no longer active.
    let priced = { ok: false };
    if (bed?.service_id) {
      const category = await resolvePatientCategory(tenantDb, bill.patient_id);
      priced = await resolveAndPriceService(tenantDb, bed.service_id, category, nights);
    }
    const rate = money2(bed?.daily_rate || 0);

    await appendItemOnce(bill.id, tenantId, {
      source: "IPD_ROOM",
      description: label,
      amount: priced.ok ? priced.line.amount : rate.times(nights),
      reference_type: "admission",
      reference_id: BigInt(admission.id),
      ...(priced.ok
        ? {
            service_id: priced.service.id,
            tariff_id: priced.tariff.id,
            quantity: priced.line.quantity,
            unit_price: priced.line.unit_price,
            taxable_amount: priced.line.taxable_amount,
            tax_rate: priced.line.tax_rate,
            cgst_amount: priced.line.cgst_amount,
            sgst_amount: priced.line.sgst_amount,
            igst_amount: priced.line.igst_amount,
            tax_amount: priced.line.tax_amount,
          }
        : {}),
    });

    await tenantDb.bills.update({ where: { id: bill.id }, data: { finalized_at: new Date() } });
    const finalBill = await tenantDb.bills.findUnique({
      where: { id: bill.id },
      include: { bill_items: true, payments: true, discounts: true, refunds: true },
    });
    emitToModule(tenantId, "BILLING", "bill:updated", { bill: finalBill });
  }).catch((err) => console.error("billingEvents admission:discharged failed", err));
});

module.exports = {};
