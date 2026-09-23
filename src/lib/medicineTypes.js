"use strict";

// The fixed set of medicine types — shown throughout the pharmacy UI next
// to every medicine, never hidden in a technical field.
const MEDICINE_TYPES = [
  "Tablet", "Capsule", "Syrup", "Injection", "Cream", "Ointment", "Drops",
  "Inhaler", "Powder", "Suspension", "Sachet", "Gel", "Lotion", "Spray", "Other",
];

const SCHEDULES = ["OTC", "H", "H1", "X", "Other"];

module.exports = { MEDICINE_TYPES, SCHEDULES };
