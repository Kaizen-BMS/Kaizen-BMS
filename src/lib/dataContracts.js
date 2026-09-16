"use strict";

const { z } = require("zod");

/**
 * Data Contracts — Phase 3 of the platform rebuild (CLAUDE.md "Platform
 * rebuild"). A `module_connections` row alone must never mean "share
 * everything" — this file is the code-defined catalog of what a
 * connection TYPE is allowed to carry at most, mirroring the exact split
 * forms.js's CORE_FIELDS already uses for form_templates: the full field
 * list is code-defined here (never client-editable — a client cannot
 * invent a new field a contract never declared), while WHICH of those
 * fields are actually turned on for one specific connection, and what
 * actions (view/create/update/delete) it grants, is tenant-admin data
 * stored on that connection's own `allowed_fields`/`permissions` JSON
 * columns, validated against this catalog before being written.
 *
 * Only two contract types exist yet — enough to prove the pattern without
 * overbuilding every future connection this phase doesn't need.
 */

const CONNECTION_ACTIONS = ["view", "create", "update", "delete"];

const CONNECTION_TYPES = {
  PRESCRIPTION_FULFILLMENT: {
    label: "Prescription Fulfillment",
    sourceModule: "DOCTOR_OPD",
    targetModule: "PHARMACY",
    description: "A doctor's prescription line, sent to a pharmacy instance to be dispensed.",
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
    sourceModule: "DOCTOR_OPD",
    targetModule: "LAB",
    description: "A doctor's lab order, sent to a lab instance for sample collection and results.",
    fields: [
      "labOrderId",
      "patientId",
      "patientName",
      "visitId",
      "doctorId",
      "doctorName",
      "testsRequested",
    ],
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
    sourceModule: "DOCTOR_OPD",
    targetModule: "BILLING",
    description: "An OPD visit's consultation/service charges, sent to Billing for invoicing.",
    fields: ["visitId", "patientId", "patientName", "consultationId", "doctorId", "fee"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  IPD_PRESCRIPTION_FULFILLMENT: {
    label: "IPD Prescription Fulfillment",
    sourceModule: "IPD",
    targetModule: "PHARMACY",
    description: "An admitted patient's prescription line, sent to a pharmacy instance to be dispensed.",
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
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  IPD_LAB_ORDER_ROUTING: {
    label: "IPD Lab Order Routing",
    sourceModule: "IPD",
    targetModule: "LAB",
    description: "An admitted patient's lab order, sent to a lab instance for sample collection and results.",
    fields: ["labOrderId", "patientId", "patientName", "admissionId", "doctorId", "doctorName", "testsRequested"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  IPD_BILLING_SYNC: {
    label: "IPD Billing Sync",
    sourceModule: "IPD",
    targetModule: "BILLING",
    description: "An admission's room/service charges, sent to Billing for the running IPD bill.",
    fields: ["admissionId", "patientId", "patientName", "bedId", "wardType"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view", "create"],
  },
  APPOINTMENT_TO_CONSULTATION: {
    label: "Appointment to Consultation",
    sourceModule: "APPOINTMENTS",
    targetModule: "DOCTOR_OPD",
    description: "A booked appointment's details, made available to OPD when the patient is seen.",
    fields: ["appointmentId", "patientId", "patientName", "doctorId", "slotTime", "reason"],
    restrictedFields: ["diagnosis", "medicalHistory", "privateNotes"],
    defaultActions: ["view"],
  },
};

function getContract(connectionType) {
  return CONNECTION_TYPES[connectionType] || null;
}

/** Which contract type (if any) governs a connection from this source module to this target module — the Connection Center's create flow derives connectionType from a plain module pair rather than asking an admin to know contract names. */
function findContractForModulePair(sourceModule, targetModule) {
  const entry = Object.entries(CONNECTION_TYPES).find(
    ([, c]) => c.sourceModule === sourceModule && c.targetModule === targetModule,
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
