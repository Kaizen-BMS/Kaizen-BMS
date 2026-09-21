"use strict";

/**
 * Feature access — the admin decides, per person, which parts of the system
 * they may use. Roles still set the baseline (a receptionist never gets
 * pharmacy stock); this only lets an admin switch features OFF for an
 * individual. Enforced on every API call and page, and the sidebar hides them.
 */
const FEATURES = {
  registration: { label: "Registration & patients", module: null },
  opd: { label: "Doctor / OPD (consultations, prescriptions)", module: "DOCTOR_OPD" },
  appointments: { label: "Appointments", module: "APPOINTMENTS" },
  pharmacy: { label: "Pharmacy", module: "PHARMACY" },
  lab: { label: "Lab", module: "LAB" },
  radiology: { label: "Radiology", module: "RADIOLOGY" },
  ipd: { label: "IPD / Beds", module: "IPD" },
  billing: { label: "Billing & reports", module: "BILLING" },
};

const PREFIX_FEATURE = [
  ["patient:", "registration"],
  ["visit:", "registration"],
  ["consultation:", "opd"],
  ["prescription:", "opd"],
  ["laborder:", "opd"],
  ["appointment:", "appointments"],
  ["doctorslot:", "appointments"],
  ["stock:", "pharmacy"],
  ["dispense:", "pharmacy"],
  ["lab:", "lab"],
  ["radiology:", "radiology"],
  ["admission:", "ipd"],
  ["bed:", "ipd"],
  ["nursingnote:", "ipd"],
  ["bill:", "billing"],
  ["reports:", "billing"],
  ["service:", "billing"],
  ["tariff:", "billing"],
  ["fee:", "billing"],
];

function featureOfAction(action) {
  if (!action) return null;
  const hit = PREFIX_FEATURE.find(([p]) => action.startsWith(p));
  return hit ? hit[1] : null;
}

// nav item key -> feature
const NAV_FEATURE = {
  registration: "registration",
  patients: "registration",
  opd: "opd",
  appointments: "appointments",
  todayAppointments: "appointments",
  pharmacy: "pharmacy",
  lab: "lab",
  radiology: "radiology",
  ipd: "ipd",
  billing: "billing",
  reports: "billing",
};

function parseDeny(v) {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.filter((x) => FEATURES[x]) : [];
  } catch {
    return [];
  }
}

module.exports = { FEATURES, featureOfAction, NAV_FEATURE, parseDeny };
