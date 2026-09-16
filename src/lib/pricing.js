"use strict";

/**
 * Service Master + Tariff Master — migration 027 (CLAUDE.md "Pricing /
 * Tariff"). A Service is a reusable billable catalog entry; a Tariff is its
 * versioned price + tax configuration over time. Historical bills snapshot
 * their own price onto `bill_items` (see `priceLine()`/`snapshotFields()`
 * below) — they never move when a tariff changes later.
 *
 * Money math here uses Prisma's re-exported `Decimal` (decimal.js)
 * throughout, never plain JS numbers — this is a financial subsystem
 * (CLAUDE.md Phase 6 instruction #24).
 */
const { z } = require("zod");
const { Prisma } = require("@prisma/client");
const { PAYMENT_CATEGORIES } = require("./patientInsurance");

const { Decimal } = Prisma;
const ROUND = Decimal.ROUND_HALF_UP;

const SERVICE_TYPES = [
  "OPD",
  "CONSULTATION",
  "PROCEDURE",
  "IPD",
  "ROOM",
  "LAB",
  "RADIOLOGY",
  "EMERGENCY",
  "PHARMACY",
  "OTHER",
];

// Same category vocabulary patient_insurance.payment_category already
// established — reused, not duplicated (see the migration's own comment).
const PATIENT_CATEGORIES = PAYMENT_CATEGORIES;

function money2(d) {
  return new Decimal(d).toDecimalPlaces(2, ROUND);
}

// ── Service Master ──────────────────────────────────────────────────────

const serviceInputSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  serviceType: z.enum(SERVICE_TYPES),
});

const serviceUpdateSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  active: z.coerce.boolean().optional(),
});

function serializeService(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    serviceType: row.service_type,
    active: !!row.active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Tariff Master ────────────────────────────────────────────────────────

const tariffInputSchema = z
  .object({
    serviceId: z.coerce.number().int().positive(),
    patientCategory: z.enum(PATIENT_CATEGORIES).optional().default("SELF_PAY"),
    context: z.string().trim().max(100).optional().or(z.literal("")),
    price: z.coerce.number().min(0).max(100_000_000),
    taxInclusive: z.coerce.boolean().optional().default(false),
    taxCategory: z.string().trim().max(50).optional().or(z.literal("")),
    cgstRate: z.coerce.number().min(0).max(100).optional().default(0),
    sgstRate: z.coerce.number().min(0).max(100).optional().default(0),
    igstRate: z.coerce.number().min(0).max(100).optional().default(0),
    effectiveFrom: z.coerce.date().optional(),
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  // Intra-state (CGST+SGST) and inter-state (IGST) are mutually exclusive
  // in real GST practice — reject a tariff that tries to be both at once
  // rather than silently accepting an inconsistent configuration.
  .refine((v) => !(v.igstRate > 0 && (v.cgstRate > 0 || v.sgstRate > 0)), {
    message: "igstRate cannot be combined with cgstRate/sgstRate",
    path: ["igstRate"],
  });

function serializeTariff(row) {
  if (!row) return null;
  return {
    id: row.id,
    serviceId: row.service_id,
    patientCategory: row.patient_category,
    context: row.context,
    price: row.price?.toString(),
    taxInclusive: !!row.tax_inclusive,
    taxCategory: row.tax_category,
    cgstRate: row.cgst_rate?.toString(),
    sgstRate: row.sgst_rate?.toString(),
    igstRate: row.igst_rate?.toString(),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    active: !!row.active,
    reason: row.reason,
    supersededByTariffId: row.superseded_by_tariff_id,
    current: row.active && row.effective_to == null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new tariff for a service, atomically closing whichever tariff
 * is currently open (active, effective_to IS NULL) for the same
 * (service, patientCategory) — versioning, never destructive editing (see
 * migration 027's own comment, and CLAUDE.md Phase 6 instruction #16).
 * `db` must be a transaction handle (tx) — the caller decides the
 * transaction boundary since some callers (e.g. seeding a service +
 * its first tariff together) want a wider one.
 */
async function changeTariff(db, input, userId) {
  const v = tariffInputSchema.parse(input);
  const serviceId = BigInt(v.serviceId);

  const service = await db.services.findUnique({ where: { id: serviceId } });
  if (!service) {
    const err = new Error("service_not_found");
    err.status = 404;
    throw err;
  }
  if (!service.active) {
    const err = new Error("service_inactive");
    err.status = 400;
    throw err;
  }

  const effectiveFrom = v.effectiveFrom || new Date();

  const current = await db.tariffs.findFirst({
    where: { service_id: serviceId, patient_category: v.patientCategory, active: true, effective_to: null },
  });
  if (current && effectiveFrom < current.effective_from) {
    const err = new Error("effective_from_before_current_tariff");
    err.status = 400;
    throw err;
  }

  const data = {
    service_id: serviceId,
    patient_category: v.patientCategory,
    context: v.context || null,
    price: money2(v.price),
    tax_inclusive: v.taxInclusive,
    tax_category: v.taxCategory || null,
    cgst_rate: money2(v.cgstRate),
    sgst_rate: money2(v.sgstRate),
    igst_rate: money2(v.igstRate),
    effective_from: effectiveFrom,
    reason: v.reason || null,
    created_by: userId ?? null,
    updated_by: userId ?? null,
  };

  // Close the currently-open tariff BEFORE inserting the new one — both
  // rows would otherwise satisfy open_slot=1 (active, effective_to NULL)
  // at the same instant and collide on uq_tariffs_open_slot themselves.
  // Closing first frees that slot for the new row; superseded_by_tariff_id
  // is filled in afterward once the new row's id exists.
  if (current) {
    await db.tariffs.update({
      where: { id: current.id },
      data: { effective_to: effectiveFrom, updated_by: userId ?? null },
    });
  }

  let created;
  try {
    created = await db.tariffs.create({ data });
  } catch (err) {
    // The uq_tariffs_open_slot constraint is the real guarantee under a
    // genuine race (two admins re-pricing the same service at once) — the
    // findFirst() above is the fast, friendly path, not the only guard.
    if (err.code === "P2002") {
      const conflict = new Error("tariff_conflict");
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }

  if (current) {
    await db.tariffs.update({
      where: { id: current.id },
      data: { superseded_by_tariff_id: created.id },
    });
  }

  return created;
}

/** The tariff applicable to a service/category at a given instant (default: now). */
async function findApplicableTariff(db, serviceId, patientCategory, at) {
  const atDate = at || new Date();
  return db.tariffs.findFirst({
    where: {
      service_id: BigInt(serviceId),
      patient_category: patientCategory,
      active: true,
      effective_from: { lte: atDate },
      OR: [{ effective_to: null }, { effective_to: { gt: atDate } }],
    },
    orderBy: { effective_from: "desc" },
  });
}

/**
 * Canonical, Decimal-safe line calculation — the ONE place unit price +
 * quantity + tax become a billed amount (CLAUDE.md Phase 6 instruction #9:
 * one canonical calculation path, no floating-point money math).
 * `tariff` is a raw tariffs row (Decimal fields as Prisma.Decimal).
 * Returns everything `bill_items`'s price-snapshot columns need, including
 * the final `amount` — same semantics `recomputeBillStatus()` already sums.
 */
function priceLine(tariff, quantity) {
  const qty = money2(quantity ?? 1);
  const unitPrice = money2(tariff.price);
  const cgstRate = new Decimal(tariff.cgst_rate);
  const sgstRate = new Decimal(tariff.sgst_rate);
  const igstRate = new Decimal(tariff.igst_rate);
  const taxRate = cgstRate.plus(sgstRate).plus(igstRate);

  const gross = unitPrice.times(qty);
  let taxableAmount;
  let taxAmount;
  if (tariff.tax_inclusive && taxRate.greaterThan(0)) {
    taxableAmount = money2(gross.dividedBy(new Decimal(1).plus(taxRate.dividedBy(100))));
    taxAmount = money2(gross.minus(taxableAmount));
  } else {
    taxableAmount = money2(gross);
    taxAmount = taxRate.greaterThan(0) ? money2(taxableAmount.times(taxRate).dividedBy(100)) : money2(0);
  }

  const splitByRate = (rate) =>
    taxRate.greaterThan(0) && taxAmount.greaterThan(0)
      ? money2(taxAmount.times(rate).dividedBy(taxRate))
      : money2(0);

  const cgstAmount = splitByRate(cgstRate);
  const sgstAmount = splitByRate(sgstRate);
  const igstAmount = splitByRate(igstRate);
  const amount = money2(taxableAmount.plus(taxAmount));

  return {
    quantity: qty,
    unit_price: unitPrice,
    taxable_amount: taxableAmount,
    tax_rate: money2(taxRate),
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    tax_amount: taxAmount,
    amount,
  };
}

/**
 * The patient's own payment category (CLAUDE.md "Insurance / payment"), or
 * SELF_PAY when none is on file — the same default every tariff-pricing
 * call site in this codebase uses so billing staff/clinicians never have
 * to re-enter data that's already captured at registration.
 */
async function resolvePatientCategory(db, patientId) {
  const insurance = await db.patient_insurance.findUnique({
    where: { patient_id: BigInt(patientId) },
    select: { payment_category: true },
  });
  return insurance?.payment_category || "SELF_PAY";
}

/**
 * Phase 7 — the one shared "resolve a service's price right now" call every
 * integration point (consultation, lab order item, prescription item,
 * IPD room) uses. Returns a result object rather than throwing — matching
 * this codebase's own `bookAppointment()` precedent — since callers need
 * to react differently: an interactive create route wants a clean 400
 * ("Pricing not configured" — CLAUDE.md Phase 7 instruction #36, NEVER a
 * silent ₹0), while a fire-and-forget IPD event listener
 * (`billingEvents.js`) just wants to skip pricing gracefully and fall back
 * to its existing manual-value path.
 */
async function resolveAndPriceService(db, serviceId, patientCategory, quantity, at) {
  const service = await db.services.findUnique({ where: { id: BigInt(serviceId) } });
  if (!service || !service.active) return { ok: false, reason: "service_unavailable" };

  const tariff = await findApplicableTariff(db, serviceId, patientCategory || "SELF_PAY", at);
  if (!tariff) return { ok: false, reason: "no_active_tariff" };

  return { ok: true, service, tariff, line: priceLine(tariff, quantity) };
}

module.exports = {
  SERVICE_TYPES,
  PATIENT_CATEGORIES,
  serviceInputSchema,
  serviceUpdateSchema,
  serializeService,
  tariffInputSchema,
  serializeTariff,
  changeTariff,
  findApplicableTariff,
  priceLine,
  resolveAndPriceService,
  resolvePatientCategory,
  money2,
};
