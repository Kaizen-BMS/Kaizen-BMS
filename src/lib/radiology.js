"use strict";

/**
 * Radiology module — the next major phase after Alerts & Notifications
 * Center. A radiology order is ONE study per row (mirrors lab_orders'
 * shape but not its JSON-array-of-tests approach — real radiology
 * ordering is per-study, "CT Head," not a bundle) and reuses the EXISTING
 * Service/Tariff Master for pricing: `services.service_type` already had
 * a RADIOLOGY value since Phase 6 (migration 027), so there is no new
 * pricing system here — `resolveAndPriceService()`/`resolvePatientCategory()`
 * from src/lib/pricing.js are reused directly, exactly like Lab/Pharmacy
 * already do.
 *
 * Findings/impression live directly on the order row, not a separate
 * report table — "COMPLETED" (set by submitting the report) IS the report
 * lifecycle; this project's own "do not create unnecessary state
 * complexity" instruction was taken literally rather than adding a 6th
 * status to distinguish "study done" from "report submitted."
 */
const { z } = require("zod");

const RADIOLOGY_STATUSES = ["ORDERED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const RADIOLOGY_PRIORITIES = ["ROUTINE", "URGENT", "STAT"];
const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

const createOrderSchema = z.object({
  studyName: z.string().trim().min(1).max(191),
  priority: z.enum(RADIOLOGY_PRIORITIES).optional().default("ROUTINE"),
  // Optional, explicit Service Master link — never inferred from
  // studyName text at billing time (CLAUDE.md Phase 7 discipline).
  serviceId: z.coerce.number().int().positive().optional(),
  // The requisition — what a radiologist needs to protocol the study safely.
  modality: z.string().trim().max(20).optional().or(z.literal("")),
  bodyPart: z.string().trim().max(80).optional().or(z.literal("")),
  laterality: z.enum(["NA", "LEFT", "RIGHT", "BOTH"]).optional().default("NA"),
  contrast: z.enum(["NONE", "WITH", "LET_RADIOLOGIST_DECIDE"]).optional().or(z.literal("")),
  clinicalIndication: z.string().trim().min(3).max(500),
  pregnancyStatus: z.enum(["NOT_APPLICABLE", "NO", "POSSIBLE", "YES"]).optional().default("NOT_APPLICABLE"),
  safetyFlags: z.array(z.enum(["PACEMAKER", "METAL_IMPLANT", "CONTRAST_ALLERGY", "KIDNEY_DISEASE", "CLAUSTROPHOBIA", "DIABETIC_METFORMIN"])).max(6).optional().default([]),
  mobility: z.enum(["WALKING", "WHEELCHAIR", "STRETCHER"]).optional().default("WALKING"),
  instructions: z.string().trim().max(500).optional().or(z.literal("")),
});

const scheduleSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
});

const cancelSchema = z.object({
  reason: z.string().trim().min(1).max(255),
});

const reportSchema = z.object({
  findings: z.string().trim().max(4000).optional().or(z.literal("")),
  impression: z.string().trim().min(1).max(2000),
});

function serializeOrder(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    visitId: row.visit_id != null ? Number(row.visit_id) : null,
    consultationId: Number(row.consultation_id),
    patientId: Number(row.patient_id),
    serviceId: row.service_id != null ? Number(row.service_id) : null,
    studyName: row.study_name,
    priority: row.priority,
    modality: row.modality ?? null,
    bodyPart: row.body_part ?? null,
    laterality: row.laterality ?? "NA",
    contrast: row.contrast ?? null,
    clinicalIndication: row.clinical_indication ?? null,
    pregnancyStatus: row.pregnancy_status ?? "NOT_APPLICABLE",
    safetyFlags: row.safety_flags ? String(row.safety_flags).split(",").filter(Boolean) : [],
    mobility: row.mobility ?? "WALKING",
    instructions: row.instructions ?? null,
    status: row.status,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    findings: row.findings,
    impression: row.impression,
    orderedBy: row.ordered_by != null ? Number(row.ordered_by) : null,
    performedBy: row.performed_by != null ? Number(row.performed_by) : null,
    reportedBy: row.reported_by != null ? Number(row.reported_by) : null,
    reportedAt: row.reported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Present only when the caller included the join (list/detail routes).
    patientName: row.patients?.name,
    // doctorName is attached separately via attachDoctorNames() below —
    // deliberately not a Prisma `include` on a guessed relation name (this
    // table has three separate FKs to `users`, and getting the generated
    // relation field name wrong would silently return `undefined` instead
    // of failing loudly).
    doctorName: row.doctorName,
  };
}

/**
 * Batch-attach `doctorName` (from `ordered_by`) onto a list of already-
 * serialized orders — one query for the whole list, never one per row
 * (CLAUDE.md's own "avoid N+1" discipline, same as the Pharmacy
 * availability route's aggregate stock query).
 */
async function attachDoctorNames(db, tenantId, orders) {
  const doctorIds = [...new Set(orders.map((o) => o.orderedBy).filter((id) => id != null))];
  if (doctorIds.length === 0) return orders;
  // `users` is deliberately outside TENANT_SCOPED_MODELS (tenant_id is
  // nullable there, for SUPER_ADMIN) — filter explicitly rather than rely
  // on tenantDb's auto-injection, same belt-and-braces discipline as
  // checkContractAccess()'s own explicit tenant checks.
  const doctors = await db.users.findMany({
    where: { id: { in: doctorIds.map(BigInt) }, tenant_id: BigInt(tenantId) },
    select: { id: true, name: true },
  });
  const nameById = new Map(doctors.map((d) => [Number(d.id), d.name]));
  return orders.map((o) => ({ ...o, doctorName: o.orderedBy != null ? nameById.get(o.orderedBy) || null : null }));
}

module.exports = {
  RADIOLOGY_STATUSES,
  RADIOLOGY_PRIORITIES,
  TERMINAL_STATUSES,
  createOrderSchema,
  scheduleSchema,
  cancelSchema,
  reportSchema,
  serializeOrder,
  attachDoctorNames,
};
