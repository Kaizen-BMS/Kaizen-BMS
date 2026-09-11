"use strict";

/**
 * Allergy-NAME matching only — deliberately not a drug-drug interaction
 * checker. A real DDI checker needs a licensed clinical drug database and is
 * a separate, much bigger undertaking; flag it explicitly if it's ever
 * wanted. This just catches "patient is allergic to X, medicine is X (or a
 * common brand/category of X)".
 *
 * Shared between the client (instant inline warning while typing) and the
 * server (the authoritative check — the client is never trusted alone).
 */

const norm = (s) => String(s || "").toLowerCase().trim();

// Small, deliberately editable set of category -> common drug aliases, so
// "amoxicillin" matches a patient allergy of "Penicillin", etc.
const CATEGORY_ALIASES = {
  penicillin: ["penicillin", "amoxicillin", "ampicillin", "amoxyclav", "augmentin", "cloxacillin"],
  cephalosporin: ["cephalosporin", "cefixime", "ceftriaxone", "cefuroxime", "cefpodoxime"],
  sulfa: ["sulfa", "sulfonamide", "cotrimoxazole", "bactrim", "sulfamethoxazole"],
  nsaid: ["nsaid", "aspirin", "ibuprofen", "diclofenac", "naproxen", "mefenamic"],
  macrolide: ["macrolide", "azithromycin", "erythromycin", "clarithromycin"],
};

/**
 * Returns the matching allergy string if `medicineName` looks like it belongs
 * to one of the patient's declared `allergies`, else null.
 */
function matchAllergy(medicineName, allergies) {
  const med = norm(medicineName);
  if (!med || !Array.isArray(allergies) || allergies.length === 0) return null;

  for (const raw of allergies) {
    const a = norm(raw);
    if (!a) continue;
    if (med.includes(a) || a.includes(med)) return raw;

    const aliases = CATEGORY_ALIASES[a];
    if (aliases && aliases.some((alias) => med.includes(alias))) return raw;

    for (const [category, categoryAliases] of Object.entries(CATEGORY_ALIASES)) {
      if (a === category) continue; // already checked above
      if (categoryAliases.some((alias) => alias === a) && med.includes(category)) {
        return raw;
      }
    }
  }
  return null;
}

module.exports = { matchAllergy, CATEGORY_ALIASES };
