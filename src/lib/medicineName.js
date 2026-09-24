"use strict";

// One human-readable medicine identity everywhere ("Cap Betadine 500 mg"),
// composed once from type + base name + strength so nobody builds it by hand.
const TYPE_PREFIX = {
  Tablet: "Tab", Capsule: "Cap", Syrup: "Syp", Injection: "Inj", Cream: "Cream", Ointment: "Oint",
  Drops: "Drops", Inhaler: "Inh", Powder: "Pwd", Suspension: "Susp", Sachet: "Sachet", Gel: "Gel",
  Lotion: "Lotion", Spray: "Spray", Other: "",
};

function composeMedicineName(type, baseName, strength) {
  const base = String(baseName || "").trim();
  const str = String(strength || "").trim();
  const prefix = TYPE_PREFIX[type] ?? "";
  const parts = [];
  // Don't add "Tab" twice if the pharmacist already typed "Tab Paracetamol".
  const alreadyPrefixed = prefix && base.toLowerCase().split(/\s+/)[0] === prefix.toLowerCase();
  if (prefix && !alreadyPrefixed) parts.push(prefix);
  parts.push(base);
  if (str && !base.toLowerCase().includes(str.toLowerCase())) parts.push(str);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

module.exports = { TYPE_PREFIX, composeMedicineName };
