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
};

function getContract(connectionType) {
  return CONNECTION_TYPES[connectionType] || null;
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
  sanitizeGrant,
  connectionGrantSchema,
};
