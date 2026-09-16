import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { validateCustomFields } from "@/lib/forms";
import { emitToTenant } from "@/lib/realtime";
import { resolveAndPriceService, resolvePatientCategory } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// `fee` becomes optional the moment `serviceId` is given — the tariff
// computes it server-side, never trusting a client-supplied final amount
// (CLAUDE.md "Pricing / Tariff — OPD integration"). Without `serviceId`,
// behavior is byte-for-byte what it was before Phase 7: `fee` required,
// `fee_source` stays 'MANUAL' — the existing manual-entry path is an
// explicit, permanent option, not a deprecated one.
const createSchema = z
  .object({
    visitId: z.coerce.number().int().positive(),
    notes: z.string().trim().max(5000).optional().default(""),
    diagnosis: z.string().trim().max(500).optional().default(""),
    fee: z.coerce.number().min(0).max(1_000_000).optional(),
    serviceId: z.coerce.number().int().positive().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((b) => b.serviceId != null || b.fee != null, {
    message: "fee is required unless serviceId is given",
    path: ["fee"],
  });

export const POST = apiRoute("consultation:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const visit = await tenantDb.visits.findUnique({
    where: { id: BigInt(body.visitId) },
    select: { id: true, patient_id: true, status: true },
  });
  if (!visit) return json({ error: "visit_not_found" }, 404);
  if (visit.status === "DISCHARGED" || visit.status === "CANCELLED") {
    return json({ error: "visit_closed" }, 409);
  }

  const custom = await validateCustomFields(
    session.tenantId,
    "CONSULTATION",
    body.customFields,
  );

  // Preferred path: a CONSULTATION-type Service was chosen — resolve its
  // current tariff and price the fee from it (Decimal-safe, with GST).
  // "Pricing not configured" is a clean 400, never a silent ₹0 fee.
  let feeData = { fee: body.fee, fee_source: "MANUAL" };
  if (body.serviceId != null) {
    const category = await resolvePatientCategory(tenantDb, visit.patient_id);
    const priced = await resolveAndPriceService(tenantDb, body.serviceId, category, 1);
    if (!priced.ok) throw new HttpError(400, `pricing_not_configured: ${priced.reason}`);
    feeData = {
      fee: priced.line.amount,
      fee_source: "TARIFF",
      service_id: priced.service.id,
      tariff_id: priced.tariff.id,
      unit_price: priced.line.unit_price,
      taxable_amount: priced.line.taxable_amount,
      tax_rate: priced.line.tax_rate,
      cgst_amount: priced.line.cgst_amount,
      sgst_amount: priced.line.sgst_amount,
      igst_amount: priced.line.igst_amount,
      tax_amount: priced.line.tax_amount,
    };
  }

  const created = await tenantDb.consultations.create({
    data: {
      visit_id: visit.id,
      patient_id: visit.patient_id,
      doctor_id: BigInt(session.userId),
      notes: body.notes || null,
      diagnosis: body.diagnosis || null,
      custom_fields: custom ? JSON.stringify(custom) : null,
      ...feeData,
    },
  });

  if (visit.status === "REGISTERED") {
    await tenantDb.visits.update({ where: { id: visit.id }, data: { status: "WITH_DOCTOR" } });
    emitToTenant(session.tenantId, "visit:updated", {
      visit: { id: Number(visit.id), status: "WITH_DOCTOR" },
    });
  }

  const withPatient = await tenantDb.consultations.findUnique({
    where: { id: created.id },
    include: { patients: { select: { name: true } } },
  });
  const { patients: p, ...rest } = withPatient;
  const consultation = { ...rest, patient_name: p.name };

  // Same request cycle. Hospital-wide board event (front desk + OPD queue).
  emitToTenant(session.tenantId, "consultation:created", { consultation });

  return json({ consultation }, 201);
});
