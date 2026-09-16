import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { resolveAndPriceService, resolvePatientCategory } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  visitId: z.coerce.number().int().positive(),
});

// OPD billing: created once, at checkout. Auto-populates line items from
// what already happened on this visit. Phase 7: a pharmacy item / lab test
// explicitly mapped to a Service Master entry (prescription_items.service_id
// / lab_order_items — see migration 028) is now priced from its current
// tariff (Decimal-safe, with GST) instead of the old flat amount:0 — an
// UNMAPPED item still gets exactly the old behavior: amount left at 0 for
// billing staff to price manually via PATCH .../items/[itemId] (there is no
// requirement that every medicine/test be catalogued). Calling this twice
// for the same visit reuses the existing bill rather than creating a
// duplicate — the whole item-creation loop only ever runs once, inside the
// same transaction as the bill itself, so retries are inherently safe.
export const POST = apiRoute("bill:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const visitId = BigInt(body.visitId);

  const visit = await tenantDb.visits.findUnique({
    where: { id: visitId },
    select: { id: true, patient_id: true },
  });
  if (!visit) return json({ error: "visit_not_found" }, 404);

  const existing = await tenantDb.bills.findFirst({
    where: { visit_id: visitId, bill_type: "OPD" },
  });
  if (existing) return json({ bill: existing }, 200);

  const [consultations, prescriptionItemsAll, labOrders] = await Promise.all([
    tenantDb.consultations.findMany({ where: { visit_id: visitId } }),
    tenantDb.prescription_items.findMany({
      where: { prescriptions: { visit_id: visitId } },
    }),
    tenantDb.lab_orders.findMany({ where: { visit_id: visitId } }),
  ]);
  const prescriptionItems = prescriptionItemsAll.filter((it) => it.dispensed_quantity > 0);

  if (consultations.length === 0 && prescriptionItems.length === 0 && labOrders.length === 0) {
    throw new HttpError(400, "nothing to bill — no consultation, dispensed items, or lab orders on this visit yet");
  }

  const labOrderIds = labOrders.map((lo) => lo.id);
  const labOrderItems = labOrderIds.length
    ? await tenantDb.lab_order_items.findMany({ where: { lab_order_id: { in: labOrderIds } } })
    : [];
  const patientCategory = await resolvePatientCategory(tenantDb, visit.patient_id);

  const bill = await tenantDb.$transaction(async (tx) => {
    const created = await tx.bills.create({
      data: {
        patient_id: visit.patient_id,
        visit_id: visitId,
        bill_type: "OPD",
        created_by: BigInt(session.userId),
      },
    });

    for (const c of consultations) {
      // fee_source='TARIFF' (Phase 7) carries a full price snapshot onto
      // the bill item too — same fields Phase 6's ad-hoc SERVICE items
      // already snapshot. A plain MANUAL-fee consultation (every row
      // before Phase 7, and any doctor who still enters a fee directly)
      // gets exactly the same bill_item shape as always: amount only.
      await tx.bill_items.create({
        data: {
          bill_id: created.id,
          source: "CONSULTATION",
          description: "Consultation fee",
          amount: c.fee,
          reference_type: "consultation",
          reference_id: c.id,
          ...(c.fee_source === "TARIFF"
            ? {
                service_id: c.service_id,
                tariff_id: c.tariff_id,
                unit_price: c.unit_price,
                taxable_amount: c.taxable_amount,
                tax_rate: c.tax_rate,
                cgst_amount: c.cgst_amount,
                sgst_amount: c.sgst_amount,
                igst_amount: c.igst_amount,
                tax_amount: c.tax_amount,
              }
            : {}),
        },
      });
    }
    for (const it of prescriptionItems) {
      // Explicit mapping only (it.service_id, set at prescribing time from
      // the Service Master — never inferred from medicine_name text). No
      // mapping -> exactly the pre-Phase-7 behavior: amount 0, priced
      // manually.
      const priced = it.service_id
        ? await resolveAndPriceService(tx, it.service_id, patientCategory, it.dispensed_quantity)
        : { ok: false };
      await tx.bill_items.create({
        data: {
          bill_id: created.id,
          source: priced.ok ? "SERVICE" : "PHARMACY",
          description: `${it.medicine_name} × ${it.dispensed_quantity}`,
          amount: priced.ok ? priced.line.amount : 0,
          reference_type: "prescription_item",
          reference_id: it.id,
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
        },
      });
    }
    for (const lo of labOrders) {
      const tests = typeof lo.tests === "string" ? JSON.parse(lo.tests) : lo.tests || [];
      const mapped = labOrderItems.filter((li) => li.lab_order_id === lo.id && li.service_id != null);
      const mappedNames = new Set(mapped.map((m) => m.test_name));
      const unmapped = tests.filter((t) => !mappedNames.has(t));

      // One priced SERVICE line per explicitly-mapped test — never a
      // fuzzy text match, only tests the ordering clinician picked from
      // the LAB-type Service Master at order time (lab_order_items).
      for (const li of mapped) {
        const priced = await resolveAndPriceService(tx, li.service_id, patientCategory, li.quantity);
        if (!priced.ok) {
          // Mapped but currently unpriced (tariff deactivated since
          // ordering) — falls back into the unmapped bucket below rather
          // than silently billing ₹0 under a SERVICE label.
          unmapped.push(li.test_name);
          continue;
        }
        await tx.bill_items.create({
          data: {
            bill_id: created.id,
            source: "SERVICE",
            description: li.test_name,
            amount: priced.line.amount,
            reference_type: "lab_order",
            reference_id: lo.id,
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
          },
        });
      }
      // Every unmapped test on this order — exactly today's pre-Phase-7
      // behavior (one combined LAB line, amount 0, priced manually).
      if (unmapped.length) {
        await tx.bill_items.create({
          data: {
            bill_id: created.id,
            source: "LAB",
            description: unmapped.join(", "),
            amount: 0,
            reference_type: "lab_order",
            reference_id: lo.id,
          },
        });
      }
    }

    await recomputeBillStatus(tx, created.id);
    return tx.bills.findUnique({ where: { id: created.id }, include: { bill_items: true } });
  });

  emitToModule(session.tenantId, "BILLING", "bill:created", { bill });
  return json({ bill }, 201);
});
