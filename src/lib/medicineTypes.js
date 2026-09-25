"use strict";

// The fixed set of medicine types — shown throughout the pharmacy UI next
// to every medicine, never hidden in a technical field.
const MEDICINE_TYPES = [
  "Tablet", "Capsule", "Syrup", "Injection", "Cream", "Ointment", "Drops",
  "Inhaler", "Powder", "Suspension", "Sachet", "Gel", "Lotion", "Spray", "Other",
];

const SCHEDULES = ["OTC", "H", "H1", "X", "Other"];

// What a medicine of this type is normally stocked/sold as, and the piece inside it — the same
// defaults any pharmacy POS (Marg, Vyapar, ...) suggests the moment a type is picked, so a
// pharmacist isn't left guessing "Strip? Bottle? Tube?" for something as ordinary as a Syrup.
// Both are only a starting point — every field stays editable for the odd real-world exception.
const TYPE_DEFAULTS = {
  Tablet: { unit: "Strip", contentUnit: "Tablet", contentPerPack: 10 },
  Capsule: { unit: "Strip", contentUnit: "Capsule", contentPerPack: 10 },
  Syrup: { unit: "Bottle", contentUnit: "ml", contentPerPack: 100 },
  Suspension: { unit: "Bottle", contentUnit: "ml", contentPerPack: 100 },
  Drops: { unit: "Bottle", contentUnit: "ml", contentPerPack: 15 },
  Injection: { unit: "Vial", contentUnit: "ml", contentPerPack: 1 },
  Cream: { unit: "Tube", contentUnit: "gm", contentPerPack: 20 },
  Ointment: { unit: "Tube", contentUnit: "gm", contentPerPack: 20 },
  Gel: { unit: "Tube", contentUnit: "gm", contentPerPack: 20 },
  Lotion: { unit: "Bottle", contentUnit: "ml", contentPerPack: 100 },
  Powder: { unit: "Bottle", contentUnit: "gm", contentPerPack: 100 },
  Sachet: { unit: "Box", contentUnit: "Sachet", contentPerPack: 10 },
  Inhaler: { unit: "Inhaler", contentUnit: "Dose", contentPerPack: 200 },
  Spray: { unit: "Bottle", contentUnit: "ml", contentPerPack: 15 },
  Other: { unit: "", contentUnit: "", contentPerPack: null },
};

module.exports = { MEDICINE_TYPES, SCHEDULES, TYPE_DEFAULTS };
