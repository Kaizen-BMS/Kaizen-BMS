"use strict";

/**
 * How this facility prints: the registration slip ("parcha") and the bill /
 * receipt. Stored as one small JSON on the facility. Both the settings page
 * preview and the real print pages use the SAME merge + paper table, so what
 * you preview is what comes out of the printer.
 */
const PAPERS = {
  A4: { label: "A4 (full page)", width: "210mm", page: "A4" },
  A5: { label: "A5 (half page)", width: "148mm", page: "A5" },
  A6: { label: "A6 (small slip)", width: "105mm", page: "A6" },
  THERMAL80: { label: "Thermal roll 80 mm", width: "80mm", page: "80mm auto" },
  THERMAL58: { label: "Thermal roll 58 mm", width: "58mm", page: "58mm auto" },
};

const DEFAULTS = {
  slip: {
    enabled: true,
    autoPrint: false, // open the print window automatically after registering
    paper: "A5",
    title: "OPD Slip",
    showToken: true,
    showAge: true,
    showGender: true,
    showPhone: true,
    showReason: true,
    showFee: true,
    showDateTime: true,
    footer: "",
  },
  invoice: {
    paper: "A4",
    showGstin: true,
  },
};

function merge(saved) {
  let s = saved;
  if (typeof s === "string") {
    try {
      s = JSON.parse(s);
    } catch {
      s = null;
    }
  }
  const out = { slip: { ...DEFAULTS.slip }, invoice: { ...DEFAULTS.invoice } };
  if (s && typeof s === "object") {
    for (const grp of ["slip", "invoice"]) {
      for (const k of Object.keys(DEFAULTS[grp])) {
        const v = s[grp]?.[k];
        if (v === undefined || v === null) continue;
        if (typeof v === typeof DEFAULTS[grp][k]) out[grp][k] = v;
      }
    }
  }
  if (!PAPERS[out.slip.paper]) out.slip.paper = DEFAULTS.slip.paper;
  if (!PAPERS[out.invoice.paper]) out.invoice.paper = DEFAULTS.invoice.paper;
  out.slip.title = String(out.slip.title).slice(0, 60);
  out.slip.footer = String(out.slip.footer).slice(0, 200);
  return out;
}

module.exports = { PAPERS, DEFAULTS, merge };
