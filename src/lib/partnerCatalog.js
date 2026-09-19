"use strict";

/**
 * "Shared information" catalog for partner connections — the owner-friendly
 * face of the existing Data Contracts. A partner request asks for CATEGORIES
 * ("Patient reference", "Lab order"); each category maps to exact fields of
 * the existing EXTERNAL_* data contract for that service. The approved
 * categories become the connection's allowed_fields (the same column the
 * existing external_connections already carries) — so there is one
 * enforcement mechanism, not a parallel one.
 *
 * Categories with no fields (Billing information, Clinical notes) are listed
 * on purpose so the consent screen states plainly what is NEVER shared;
 * they cannot be selected because no exchange type carries them.
 */
const { getContract } = require("./dataContracts");

const SERVICE_CONTRACT = {
  LAB: "EXTERNAL_LAB_ORDER",
  PHARMACY: "EXTERNAL_PHARMACY_PRESCRIPTION",
};

const SERVICE_LABEL = { LAB: "Laboratory orders", PHARMACY: "Prescription fulfillment" };
const SERVICE_DEFAULT_PURPOSE = { LAB: "Laboratory Order Processing", PHARMACY: "Prescription Fulfillment" };
const SERVICE_ORDER_TYPE = { LAB: "LAB_ORDER", PHARMACY: "PHARMACY_PRESCRIPTION" };

const CATEGORY_META = {
  PATIENT_REFERENCE: { label: "Patient reference", description: "Patient name, age, gender and reference number" },
  VISIT_REFERENCE: { label: "Visit reference", description: "Which visit this order belongs to" },
  LAB_ORDER: { label: "Lab order", description: "The test requested, its priority and ordering doctor" },
  PRESCRIPTION: { label: "Prescription", description: "Dose and quantity prescribed" },
  MEDICINE_REFERENCE: { label: "Medicine reference", description: "Medicine name and its code at the partner" },
  BILLING_INFORMATION: { label: "Billing information", description: "Never shared through order exchange" },
  CLINICAL_NOTES: { label: "Clinical notes", description: "Never shared through order exchange" },
};

const FIELDS = {
  LAB: {
    PATIENT_REFERENCE: ["patientId", "patientName", "patientAge", "patientGender", "providerPatientId"],
    VISIT_REFERENCE: ["visitId"],
    LAB_ORDER: ["labOrderId", "testName", "priority", "doctorId", "providerTestCode"],
    BILLING_INFORMATION: [],
    CLINICAL_NOTES: [],
  },
  PHARMACY: {
    PATIENT_REFERENCE: ["patientId", "patientName", "providerPatientId"],
    VISIT_REFERENCE: ["visitId"],
    PRESCRIPTION: ["prescriptionItemId", "dosage", "quantity"],
    MEDICINE_REFERENCE: ["medicineName", "providerMedicineCode"],
    BILLING_INFORMATION: [],
    CLINICAL_NOTES: [],
  },
};

function isValidService(s) {
  return s === "LAB" || s === "PHARMACY";
}

/** Categories offered for a service — `selectable: false` ones are shown as "never shared". */
function categoriesFor(service) {
  return Object.entries(FIELDS[service]).map(([key, fields]) => ({
    key,
    label: CATEGORY_META[key].label,
    description: CATEGORY_META[key].description,
    selectable: fields.length > 0,
  }));
}

function selectableKeys(service) {
  return Object.entries(FIELDS[service]).filter(([, f]) => f.length > 0).map(([k]) => k);
}

/** Keeps only known, selectable categories, de-duplicated — never trusts the client's list. */
function sanitizeCategories(service, cats) {
  const ok = new Set(selectableKeys(service));
  return [...new Set((Array.isArray(cats) ? cats : []).filter((c) => ok.has(c)))];
}

function fieldsForCategories(service, cats) {
  return [...new Set(cats.flatMap((c) => FIELDS[service][c] || []))];
}

/** Snapshot of the contract version the consent was given against. */
function currentContractVersion(service) {
  return getContract(SERVICE_CONTRACT[service]).version;
}

/** Categories whose fields cover the contract's REQUIRED fields — a connection without them can never send a valid order. */
function requiredCategories(service) {
  const required = new Set(getContract(SERVICE_CONTRACT[service]).requiredFields);
  return Object.entries(FIELDS[service])
    .filter(([, fields]) => fields.some((f) => required.has(f)))
    .map(([k]) => k);
}

function labelsFor(cats) {
  return cats.map((c) => CATEGORY_META[c]?.label || c);
}

module.exports = {
  SERVICE_CONTRACT,
  SERVICE_LABEL,
  SERVICE_DEFAULT_PURPOSE,
  SERVICE_ORDER_TYPE,
  CATEGORY_META,
  isValidService,
  categoriesFor,
  sanitizeCategories,
  fieldsForCategories,
  currentContractVersion,
  requiredCategories,
  labelsFor,
};
