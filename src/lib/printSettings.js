"use strict";

/**
 * How this facility prints: the registration slip ("parcha") and the bill /
 * receipt. Stored as one small JSON on the facility. Both the settings page
 * preview and the real print pages use the SAME merge + paper table, so what
 * you preview is what comes out of the printer.
 */
const { sanitizeLayout, presetLayout } = require("./printLayout");

const PAPERS = {
  A4: { label: "A4 (full page)", width: "210mm", page: "A4" },
  A5: { label: "A5 (half page)", width: "148mm", page: "A5" },
  A6: { label: "A6 (small slip)", width: "105mm", page: "A6" },
  THERMAL80: { label: "Thermal roll 80 mm", width: "80mm", page: "80mm auto" },
  THERMAL58: { label: "Thermal roll 58 mm", width: "58mm", page: "58mm auto" },
  CARD: { label: "ID card (85.6 × 54 mm)", width: "85.6mm", page: "85.6mm 54mm" },
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
  staffCard: {
    paper: "CARD",
  },
};

// One design a facility has saved for reuse later, on top of the single
// "active" layout each doc already has — pick one from the list to load it
// back into the canvas, without losing whatever is live right now.
const MAX_CUSTOM_PRESETS_PER_DOC = 20;
function sanitizeCustomPresets(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list.slice(0, MAX_CUSTOM_PRESETS_PER_DOC)) {
    const layout = sanitizeLayout(p?.layout);
    if (!layout) continue;
    out.push({ id: String(p.id || "").slice(0, 24) || `c${Date.now().toString(36)}`, name: String(p.name || "Untitled").slice(0, 60), savedAt: String(p.savedAt || new Date().toISOString()).slice(0, 32), layout });
  }
  return out;
}

function merge(saved) {
  let s = saved;
  if (typeof s === "string") {
    try {
      s = JSON.parse(s);
    } catch {
      s = null;
    }
  }
  const out = { slip: { ...DEFAULTS.slip }, invoice: { ...DEFAULTS.invoice }, staffCard: { ...DEFAULTS.staffCard } };
  if (s && typeof s === "object") {
    for (const grp of ["slip", "invoice", "staffCard"]) {
      for (const k of Object.keys(DEFAULTS[grp])) {
        const v = s[grp]?.[k];
        if (v === undefined || v === null) continue;
        if (typeof v === typeof DEFAULTS[grp][k]) out[grp][k] = v;
      }
    }
  }
  if (!PAPERS[out.slip.paper]) out.slip.paper = DEFAULTS.slip.paper;
  if (!PAPERS[out.invoice.paper]) out.invoice.paper = DEFAULTS.invoice.paper;
  if (!PAPERS[out.staffCard.paper]) out.staffCard.paper = DEFAULTS.staffCard.paper;
  // The designed layout is the source of truth; paper follows it.
  out.slip.layout = sanitizeLayout(s && s.slip && s.slip.layout) || presetLayout("slip", "parcha");
  out.invoice.layout = sanitizeLayout(s && s.invoice && s.invoice.layout) || presetLayout("invoice", "classic");
  out.staffCard.layout = sanitizeLayout(s && s.staffCard && s.staffCard.layout) || presetLayout("staffCard", "idCard");
  out.slip.paper = out.slip.layout.paper;
  out.invoice.paper = out.invoice.layout.paper;
  out.staffCard.paper = out.staffCard.layout.paper;
  out.slip.title = String(out.slip.title).slice(0, 60);
  out.slip.footer = String(out.slip.footer).slice(0, 200);
  out.slip.customPresets = sanitizeCustomPresets(s && s.slip && s.slip.customPresets);
  out.invoice.customPresets = sanitizeCustomPresets(s && s.invoice && s.invoice.customPresets);
  out.staffCard.customPresets = sanitizeCustomPresets(s && s.staffCard && s.staffCard.customPresets);
  return out;
}

module.exports = { PAPERS, DEFAULTS, merge, MAX_CUSTOM_PRESETS_PER_DOC };
