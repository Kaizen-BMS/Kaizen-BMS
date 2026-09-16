"use strict";

const { z } = require("zod");

/**
 * Data Contracts — Phase 3 of the platform rebuild, extended in Phase 8A
 * and Phase 8B (CLAUDE.md "Platform rebuild" / "Master data + data
 * contract foundation"). A `module_connections` row alone must never mean
 * "share everything" — this file is the code-defined catalog of what a
 * connection TYPE is allowed to carry at most, mirroring the exact split
 * forms.js's CORE_FIELDS already uses for form_templates: the full field
 * list is code-defined here (never client-editable — a client cannot
 * invent a new field a contract never declared), while WHICH of those
 * fields are actually turned on for one specific connection, and what
 * actions (view/create/update/delete) it grants, is tenant-admin data
 * stored on that connection's own `allowed_fields`/`permissions` JSON
 * columns, validated against this catalog before being written.
 *
 * Two kinds of catalog entry:
 *   - `connectable: true` (the default when omitted) — governs an actual
 *     `module_connections` row between two real module instances.
 *   - `connectable: false` — a pure field-whitelist REFERENCE shape (e.g.
 *     PatientReference) with no `module_connections` counterpart, because
 *     its "source" isn't a rentable module at all (core patient records,
 *     visits, payments aren't module-gated — same reasoning Phase 8A
 *     already documented for excluding "Patient"/"Emergency" as
 *     connectable diagram nodes). These exist purely so
 *     `dataContractValidator.js` has a reusable, versioned field
 *     whitelist to check a payload against, independent of the
 *     connection lifecycle.
 *
 * `version`/`status` (Phase 8B — CLAUDE.md Part 10): every entry now
 * carries both. Existing entries got `version: 1, status: "ACTIVE"` —
 * purely additive, nothing that reads a CONNECTION_TYPES entry broke.
 * **A contract version already in use is never edited in place** — an
 * incompatible field-list change means adding a new KEY (e.g. a future
 * `PRESCRIPTION_FULFILLMENT_V2`), never mutating this one; see
 * `getContract()`'s own comment for the version-lookup contract.
 */

const CONNECTION_ACTIONS = ["view", "create", "update", "delete"];

const CONNECTION_TYPES = {
  PRESCRIPTION_FULFILLMENT: {
    label: "Prescription Fulfillment",
    version: 1,
    status: "ACTIVE",
    sourceModule: "DOCTOR_OPD",
    targetModule: "PHARMACY",
    description: "A doctor's prescription line, sent to a pharmacy instance to be dispensed.",
    purpose: "Allow a connected pharmacy instance to see and fulfill a doctor's prescription line.",
    fields: [
      "prescriptionId",
      "patientId",
      "patientName",
      "visitId",
      "doctorId",
      "doctorName",
      "medicineId",
      "medicineName",
      "dose",
      "frequency",
      "quantity",
    ],
    // The subset of `fields` a payload cannot be missing — CLAUDE.md
    // Phase 8B Part 9's "required identifiers exist" check.
    requiredFields: ["prescriptionId", "patientId"],
    // Never offered as a toggle in any connection built on this contract —
    // listed here only so the admin UI can show what's deliberately
    // excluded, the same "Restricted" list the spec's own mockup shows.
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    // A prescription is fulfilled, never edited/deleted by the pharmacy
    // that receives it — the default permission set reflects that.
    defaultActions: ["view", "create"],
  },
  LAB_ORDER_ROUTING: {
    label: "Lab Order Routing",
    version: 1,
    status: "ACTIVE",
    sourceModule: "DOCTOR_OPD",
    targetModule: "LAB",
    description: "A doctor's lab order, sent to a lab instance for sample collection and results.",
    purpose: "Allow a connected lab instance to see and act on a doctor's lab order.",
    fields: [
      "labOrderId",
      "patientId",
      "patientName",
      "visitId",
      "doctorId",
      "doctorName",
      "testsRequested",
    ],
    requiredFields: ["labOrderId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  // Phase 8A additions (CLAUDE.md "Module Selection + Connection Center") —
  // the same catalog, extended to the other module pairs the Connection
  // Center's own product vision names, covering only modules that actually
  // exist in MODULE_NAMES (modules.js). "Patient" and "Emergency" in that
  // vision's diagram aren't real rentable modules (Emergency is a
  // visits.entry_type value handled inside OPD/IPD; core patient records
  // aren't module-gated at all) — no contract invents them.
  OPD_BILLING_SYNC: {
    label: "OPD Billing Sync",
    version: 1,
    status: "ACTIVE",
    sourceModule: "DOCTOR_OPD",
    targetModule: "BILLING",
    description: "An OPD visit's consultation/service charges, sent to Billing for invoicing.",
    purpose: "Allow Billing to invoice a visit's consultation charge.",
    fields: ["visitId", "patientId", "patientName", "consultationId", "doctorId", "fee"],
    requiredFields: ["visitId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  IPD_PRESCRIPTION_FULFILLMENT: {
    label: "IPD Prescription Fulfillment",
    version: 1,
    status: "ACTIVE",
    sourceModule: "IPD",
    targetModule: "PHARMACY",
    description: "An admitted patient's prescription line, sent to a pharmacy instance to be dispensed.",
    purpose: "Allow a connected pharmacy instance to fulfill an admitted patient's prescription line.",
    fields: [
      "prescriptionId",
      "patientId",
      "patientName",
      "admissionId",
      "doctorId",
      "doctorName",
      "medicineId",
      "medicineName",
      "dose",
      "frequency",
      "quantity",
    ],
    requiredFields: ["prescriptionId", "patientId", "admissionId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  IPD_LAB_ORDER_ROUTING: {
    label: "IPD Lab Order Routing",
    version: 1,
    status: "ACTIVE",
    sourceModule: "IPD",
    targetModule: "LAB",
    description: "An admitted patient's lab order, sent to a lab instance for sample collection and results.",
    purpose: "Allow a connected lab instance to act on an admitted patient's lab order.",
    fields: ["labOrderId", "patientId", "patientName", "admissionId", "doctorId", "doctorName", "testsRequested"],
    requiredFields: ["labOrderId", "patientId", "admissionId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  IPD_BILLING_SYNC: {
    label: "IPD Billing Sync",
    version: 1,
    status: "ACTIVE",
    sourceModule: "IPD",
    targetModule: "BILLING",
    description: "An admission's room/service charges, sent to Billing for the running IPD bill.",
    purpose: "Allow Billing to invoice an admission's room/service charges.",
    fields: ["admissionId", "patientId", "patientName", "bedId", "wardType"],
    requiredFields: ["admissionId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  APPOINTMENT_TO_CONSULTATION: {
    label: "Appointment to Consultation",
    version: 1,
    status: "ACTIVE",
    sourceModule: "APPOINTMENTS",
    targetModule: "DOCTOR_OPD",
    description: "A booked appointment's details, made available to OPD when the patient is seen.",
    purpose: "Allow OPD to see a booked appointment's details when the patient arrives.",
    fields: ["appointmentId", "patientId", "patientName", "doctorId", "slotTime", "reason"],
    requiredFields: ["appointmentId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view"],
  },
  // Phase 8B additions (CLAUDE.md "Master data + data contract
  // foundation") — fill the remaining real gaps in Part 6's minimum
  // contract catalog that correspond to actual, registered module pairs.
  LAB_RESULT_TO_CLINICAL: {
    label: "Lab Result to Clinical",
    version: 1,
    status: "ACTIVE",
    sourceModule: "LAB",
    targetModule: "DOCTOR_OPD",
    description: "A completed lab result, made available back to the ordering doctor.",
    purpose: "Let the ordering doctor see that a result is ready, without exposing lab-internal detail.",
    fields: ["labOrderId", "patientId", "visitId", "status", "resultedAt"],
    requiredFields: ["labOrderId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view"],
  },
  LAB_RESULT_TO_BILLING: {
    label: "Lab Result to Billing",
    version: 1,
    status: "ACTIVE",
    sourceModule: "LAB",
    targetModule: "BILLING",
    description: "A completed lab order, sent to Billing so the test can be invoiced.",
    purpose: "Allow Billing to invoice a completed lab order.",
    fields: ["labOrderId", "patientId", "visitId", "status", "resultedAt"],
    requiredFields: ["labOrderId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  DISPENSE_TO_BILLING: {
    label: "Dispense to Billing",
    version: 1,
    status: "ACTIVE",
    sourceModule: "PHARMACY",
    targetModule: "BILLING",
    description: "A dispensed prescription line, sent to Billing so it can be invoiced.",
    purpose: "Allow Billing to invoice a dispensed medicine line.",
    fields: ["prescriptionItemId", "patientId", "medicineId", "quantity", "dispensedAt"],
    requiredFields: ["prescriptionItemId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  // Reference-only shapes (`connectable: false`) — no module_connections
  // counterpart; see the file header comment for why. Used only through
  // dataContractValidator.js's validateContractPayload(), never through
  // requestConnection()/findContractForModulePair()'s module-pair lookup.
  PATIENT_REFERENCE: {
    label: "Patient Reference",
    version: 1,
    status: "ACTIVE",
    connectable: false,
    sourceModule: null,
    targetModule: null,
    description: "The minimal identity of a patient, referenced by id — never a full clinical record.",
    purpose: "A reusable, ID-first shape any authorized consumer may check a patient reference against.",
    fields: ["patientId", "name", "age", "gender"],
    requiredFields: ["patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "allergies", "privateNotes"],
    defaultActions: ["view"],
  },
  VISIT_REFERENCE: {
    label: "Visit Reference",
    version: 1,
    status: "ACTIVE",
    connectable: false,
    sourceModule: null,
    targetModule: null,
    description: "The minimal identity of a visit, referenced by id.",
    purpose: "A reusable, ID-first shape for referencing which visit a downstream record belongs to.",
    fields: ["visitId", "patientId", "entryType", "status", "createdAt"],
    requiredFields: ["visitId", "patientId"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view"],
  },
  PAYMENT_REFERENCE: {
    label: "Payment Reference",
    version: 1,
    status: "ACTIVE",
    connectable: false,
    sourceModule: null,
    targetModule: null,
    description: "The minimal identity of a payment, referenced by id — never card/bank details.",
    purpose: "A reusable, ID-first shape for referencing a payment (reports, receipts, reconciliation).",
    fields: ["paymentId", "billId", "amount", "mode", "paidAt"],
    requiredFields: ["paymentId", "billId"],
    restrictedFields: ["cardNumber", "bankAccount", "authToken"],
    defaultActions: ["view"],
  },
};

/**
 * Look up a contract by type, optionally re-checking its version. This is
 * the ONE lookup every consumer (the Connection Center, the validator,
 * checkContractAccess()) goes through — a version mismatch is a clean
 * `null`, never a silent fallback to whatever the latest version happens
 * to be, so an old stored payload/version reference never gets
 * re-interpreted under a newer contract shape.
 */
function getContract(connectionType, version) {
  const contract = CONNECTION_TYPES[connectionType] || null;
  if (!contract) return null;
  if (version != null && contract.version !== Number(version)) return null;
  return contract;
}

/**
 * Which contract type (if any) governs a connection from this source
 * module to this target module — the Connection Center's create flow
 * derives connectionType from a plain module pair rather than asking an
 * admin to know contract names. Only ever matches `connectable !== false`
 * entries (Phase 8B's reference-only shapes have no module pair to match).
 *
 * Extended (Phase 8B Part 12) to accept either the original positional
 * form, `findContractForModulePair(sourceModule, targetModule)`, or a
 * richer options object — `findContractForModulePair({ sourceModule,
 * targetModule, contractType, version })` — for a caller that already
 * knows which specific contract/version it wants and just needs it
 * re-validated against a module pair.
 */
function findContractForModulePair(sourceModuleOrOpts, targetModule) {
  const opts =
    typeof sourceModuleOrOpts === "object" && sourceModuleOrOpts !== null
      ? sourceModuleOrOpts
      : { sourceModule: sourceModuleOrOpts, targetModule };

  if (opts.contractType) {
    const contract = getContract(opts.contractType, opts.version);
    if (!contract || contract.connectable === false) return null;
    if (contract.sourceModule !== opts.sourceModule || contract.targetModule !== opts.targetModule) return null;
    return opts.contractType;
  }

  const entry = Object.entries(CONNECTION_TYPES).find(
    ([, c]) =>
      c.connectable !== false &&
      c.sourceModule === opts.sourceModule &&
      c.targetModule === opts.targetModule &&
      (opts.version == null || c.version === Number(opts.version)),
  );
  return entry ? entry[0] : null;
}

/** Every field/action a caller asked to enable, restricted to what the contract actually declares — never trusted bare. */
function sanitizeGrant(connectionType, { allowedFields, permissions } = {}) {
  const contract = getContract(connectionType);
  if (!contract) return null;

  const fieldSet = new Set(contract.fields);
  const cleanFields = Array.isArray(allowedFields)
    ? allowedFields.filter((f) => fieldSet.has(f))
    : contract.fields.slice(); // default: every field the contract declares, none of the restricted ones

  const actionSet = new Set(CONNECTION_ACTIONS);
  const cleanActions = Array.isArray(permissions)
    ? permissions.filter((a) => actionSet.has(a))
    : contract.defaultActions.slice();

  return { allowedFields: cleanFields, permissions: cleanActions };
}

const connectionGrantSchema = z.object({
  connectionType: z.enum(Object.keys(CONNECTION_TYPES)),
  allowedFields: z.array(z.string()).optional(),
  permissions: z.array(z.enum(CONNECTION_ACTIONS)).optional(),
});

module.exports = {
  CONNECTION_ACTIONS,
  CONNECTION_TYPES,
  getContract,
  findContractForModulePair,
  sanitizeGrant,
  connectionGrantSchema,
};
