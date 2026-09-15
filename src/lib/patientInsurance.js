"use strict";

const { z } = require("zod");

/**
 * Insurance details + payment category, captured at registration
 * (migration 021, `patient_insurance` — one row per patient, same
 * attached-per-patient choice already made for referral_sources: it
 * doesn't usually change across follow-up visits, and front desk can edit
 * it later without re-registering).
 *
 * Shared between the registration create route and the dedicated
 * patients/[id]/insurance edit route so there's one place this shape is
 * validated and rowified, not two copies that could drift — same
 * reasoning as bookAppointment()/resolveTokenNumber() elsewhere in this
 * codebase.
 */

const PAYMENT_CATEGORIES = [
  "SELF_PAY",
  "INSURANCE",
  "CORPORATE",
  "GOVERNMENT_SCHEME",
  "AYUSHMAN_BHARAT",
  "OTHER",
];

const dateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

// All optional — most walk-ins are plain self-pay with nothing here to
// fill in, and this must never block registration.
const insuranceInputSchema = z.object({
  paymentCategory: z.enum(PAYMENT_CATEGORIES).optional().default("SELF_PAY"),
  // The one generic "store the number of that thing" slot: an Ayushman
  // Bharat/PM-JAY card number, a corporate employee ID, a government
  // scheme reference — whichever applies to the chosen category. The
  // INSURANCE category already has its own policyNumber below, so this is
  // typically left blank there rather than duplicated.
  paymentReferenceNumber: z.string().trim().max(120).optional().or(z.literal("")),
  insuranceAvailable: z.coerce.boolean().optional().default(false),
  insuranceCompany: z.string().trim().max(191).optional().or(z.literal("")),
  policyNumber: z.string().trim().max(120).optional().or(z.literal("")),
  memberId: z.string().trim().max(120).optional().or(z.literal("")),
  tpa: z.string().trim().max(191).optional().or(z.literal("")),
  validFrom: dateField,
  validUntil: dateField,
  // Client-compressed JPEG data URL — no file/blob storage in this
  // project, same convention as Attendance's proxy check-in photo.
  insuranceCardUpload: z.string().trim().max(2_000_000).optional().or(z.literal("")),
  preAuthRequired: z.coerce.boolean().optional().default(false),
});

/** Parsed input -> a `patient_insurance` create/update data object. */
function toRow(input) {
  const v = insuranceInputSchema.parse(input || {});
  // The insurance sub-fields only mean anything when insurance is actually
  // available — clearing them otherwise instead of storing stale values
  // from a toggle the front-desk flipped back off.
  const available = v.insuranceAvailable;
  return {
    payment_category: v.paymentCategory,
    payment_reference_number: v.paymentReferenceNumber || null,
    insurance_available: available,
    insurance_company: available ? v.insuranceCompany || null : null,
    policy_number: available ? v.policyNumber || null : null,
    member_id: available ? v.memberId || null : null,
    tpa: available ? v.tpa || null : null,
    valid_from: available && v.validFrom ? new Date(v.validFrom) : null,
    valid_until: available && v.validUntil ? new Date(v.validUntil) : null,
    insurance_card_upload: available ? v.insuranceCardUpload || null : null,
    pre_auth_required: available ? v.preAuthRequired : false,
  };
}

/** Whether the input carries anything worth writing a row for at all. */
function hasContent(input) {
  if (!input) return false;
  const v = insuranceInputSchema.parse(input);
  return v.paymentCategory !== "SELF_PAY" || v.insuranceAvailable || !!v.paymentReferenceNumber;
}

async function upsertPatientInsurance(db, patientId, input, updatedByUserId) {
  const row = toRow(input);
  return db.patient_insurance.upsert({
    where: { patient_id: patientId },
    create: { ...row, patient_id: patientId, updated_by: updatedByUserId ?? null },
    update: { ...row, updated_by: updatedByUserId ?? null },
  });
}

function toDateStr(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** DB row -> the shape the UI/API consumes (camelCase, ids as Number). */
function serializeInsurance(row) {
  if (!row) return null;
  return {
    paymentCategory: row.payment_category,
    paymentReferenceNumber: row.payment_reference_number,
    insuranceAvailable: !!row.insurance_available,
    insuranceCompany: row.insurance_company,
    policyNumber: row.policy_number,
    memberId: row.member_id,
    tpa: row.tpa,
    validFrom: toDateStr(row.valid_from),
    validUntil: toDateStr(row.valid_until),
    insuranceCardUpload: row.insurance_card_upload,
    preAuthRequired: !!row.pre_auth_required,
  };
}

module.exports = {
  PAYMENT_CATEGORIES,
  insuranceInputSchema,
  toRow,
  hasContent,
  upsertPatientInsurance,
  serializeInsurance,
};
