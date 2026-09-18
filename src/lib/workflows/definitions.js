"use strict";

/**
 * Workflow Automation — Phase 9 (CLAUDE.md "Workflow Automation"). This is
 * the code-defined catalog of workflow TYPES — mirrors moduleRegistry.js /
 * dataContracts.js's own "the catalog is code, only progress data is a
 * row" split exactly. There is deliberately no "create a workflow" UI and
 * no way to store arbitrary executable steps in the database — a
 * definition's step list is a fixed array reviewed and shipped like any
 * other code, never tenant-editable.
 *
 * `steps` is the full, ordered checklist a workflow_instance walks through
 * (src/lib/workflows/engine.js creates one workflow_instance_steps row per
 * entry, all PENDING, the moment an instance starts). The actual logic
 * that decides when a step completes/fails/waits lives in each workflow's
 * own module (opdPharmacyBilling.js / labResultBilling.js /
 * ipdAdmissionDischarge.js) — this file only declares the shape, not the
 * behavior.
 */

const OPD_PHARMACY_BILLING_STEPS = [
  { code: "PRESCRIPTION_CREATED", label: "Prescription Created" },
  { code: "CONNECTION_VALIDATED", label: "Connection Validated" },
  { code: "CONTRACT_VALIDATED", label: "Contract Validated" },
  { code: "AVAILABILITY_CHECK", label: "Availability Check" },
  { code: "DISPENSING", label: "Dispensing" },
  { code: "BILLING", label: "Billing" },
  { code: "COMPLETED", label: "Completed" },
];

const LAB_RESULT_BILLING_STEPS = [
  { code: "ORDER_CREATED", label: "Lab Order Created" },
  { code: "RESULT_ENTERED", label: "Result Entered" },
  { code: "CLINICAL_NOTIFIED", label: "Clinical Notified" },
  { code: "BILLING_SYNCED", label: "Billing Synced" },
  { code: "COMPLETED", label: "Completed" },
];

const IPD_ADMISSION_TO_DISCHARGE_STEPS = [
  { code: "ADMITTED", label: "Admission & Bed Allocation" },
  { code: "NURSING_RECORDED", label: "Nursing / Vitals" },
  { code: "PHARMACY_SYNCED", label: "Pharmacy" },
  { code: "LAB_SYNCED", label: "Lab" },
  { code: "DISCHARGED", label: "Discharge" },
  { code: "FINAL_BILL_GENERATED", label: "Final Bill" },
  { code: "COMPLETED", label: "Completed" },
];

const RADIOLOGY_ORDER_TO_RESULT_STEPS = [
  { code: "ORDER_CREATED", label: "Order Created" },
  { code: "CONNECTION_VALIDATED", label: "Connection Validated" },
  { code: "CONTRACT_VALIDATED", label: "Contract Validated" },
  { code: "REPORT_COMPLETED", label: "Report Completed" },
  { code: "CLINICAL_NOTIFIED", label: "Clinical Notified" },
  { code: "BILLING_SYNCED", label: "Billing Synced" },
  { code: "COMPLETED", label: "Completed" },
];

const WORKFLOW_DEFINITIONS = {
  OPD_PHARMACY_BILLING: {
    code: "OPD_PHARMACY_BILLING",
    name: "OPD → Pharmacy → Billing",
    description: "A doctor's prescription, checked against a connected pharmacy instance, dispensed, and billed at OPD checkout.",
    version: 1,
    active: true,
    referenceType: "prescription",
    steps: OPD_PHARMACY_BILLING_STEPS,
  },
  LAB_RESULT_BILLING: {
    code: "LAB_RESULT_BILLING",
    name: "Lab Order → Result → Billing",
    description: "A lab order's result-entry, clinical-visibility and billing pipeline.",
    version: 1,
    active: true,
    referenceType: "lab_order",
    steps: LAB_RESULT_BILLING_STEPS,
  },
  IPD_ADMISSION_TO_DISCHARGE: {
    code: "IPD_ADMISSION_TO_DISCHARGE",
    name: "IPD Admission → Discharge",
    description: "An inpatient stay from admission through discharge and final billing.",
    version: 1,
    active: true,
    referenceType: "admission",
    steps: IPD_ADMISSION_TO_DISCHARGE_STEPS,
  },
  RADIOLOGY_ORDER_TO_RESULT: {
    code: "RADIOLOGY_ORDER_TO_RESULT",
    name: "Radiology Order → Result",
    description: "A doctor's radiology order, checked against a connected radiology instance, reported, and billed.",
    version: 1,
    active: true,
    referenceType: "radiology_order",
    steps: RADIOLOGY_ORDER_TO_RESULT_STEPS,
  },
};

function getDefinition(code) {
  return WORKFLOW_DEFINITIONS[code] || null;
}

function listDefinitions() {
  return Object.values(WORKFLOW_DEFINITIONS);
}

module.exports = { WORKFLOW_DEFINITIONS, getDefinition, listDefinitions };
