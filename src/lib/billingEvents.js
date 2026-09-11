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

/** The tenant's single OPEN, not-yet-finalized IPD bill for this visit, or null. */
async function findOpenIpdBill(visitId) {
  return tenantDb.bills.findFirst({
    where: { visit_id: visitId, bill_type: "IPD", finalized_at: null },
  });
}

/** Idempotent: never append the same source row to a bill twice. */
async function appendItemOnce(billId, tenantId, data) {
  const existing = await tenantDb.bill_items.findFirst({
    where: { bill_id: billId, reference_type: data.reference_type, reference_id: data.reference_id },
  });
  if (existing) return;
  await tenantDb.bill_items.create({ data: { bill_id: billId, ...data } });
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
    await appendItemOnce(bill.id, tenantId, {
      source: "PHARMACY",
      description: `${item.medicine_name} × ${item.dispensed_quantity}`,
      amount: 0,
      reference_type: "prescription_item",
      reference_id: BigInt(item.id),
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
    await appendItemOnce(bill.id, tenantId, {
      source: "LAB",
      description: tests.join(", ") || "Lab tests",
      amount: 0,
      reference_type: "lab_order",
      reference_id: BigInt(labOrder.id),
    });
  }).catch((err) => console.error("billingEvents lab:result failed", err));
});

serverEvents.on("admission:discharged", ({ tenantId, payload }) => {
  runWithContext({ tenantId }, async () => {
    const admission = payload.admission;
    if (!admission?.visit_id || !admission?.bed_id || !admission?.admitted_at || !admission?.discharged_at) return;
    const bill = await findOpenIpdBill(BigInt(admission.visit_id));
    if (!bill) return;

    const bed = await tenantDb.beds.findUnique({ where: { id: BigInt(admission.bed_id) }, select: { daily_rate: true, bed_number: true } });
    const admittedAt = new Date(admission.admitted_at);
    const dischargedAt = new Date(admission.discharged_at);
    const msPerDay = 24 * 60 * 60 * 1000;
    // Any part of a day counts as a full day — the usual hotel/ward billing convention.
    const nights = Math.max(1, Math.ceil((dischargedAt - admittedAt) / msPerDay));
    const rate = Number(bed?.daily_rate || 0);

    await appendItemOnce(bill.id, tenantId, {
      source: "IPD_ROOM",
      description: `Room charge — bed ${bed?.bed_number || admission.bed_id} × ${nights} day${nights > 1 ? "s" : ""}`,
      amount: rate * nights,
      reference_type: "admission",
      reference_id: BigInt(admission.id),
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
