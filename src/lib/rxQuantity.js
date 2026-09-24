// Prescription quantity is calculated, not typed:
//   dose per intake × times per day × number of days.
export const FREQUENCIES = [
  { code: "OD", label: "OD — Once daily", short: "Once daily", times: 1 },
  { code: "BD", label: "BD — Twice daily", short: "Twice daily", times: 2 },
  { code: "TID", label: "TID — Three times daily", short: "Three times daily", times: 3 },
  { code: "QID", label: "QID — Four times daily", short: "Four times daily", times: 4 },
  { code: "HS", label: "HS — At bedtime", short: "At bedtime", times: 1 },
  { code: "SOS", label: "SOS — As needed", short: "As needed", times: null },
  { code: "STAT", label: "STAT — Immediately", short: "Immediately, once", times: 1, once: true },
  { code: "CUSTOM", label: "Custom…", short: "", times: null },
];

/** "1", "2", "0.5", "1/2", "½", "1 capsule", "1.5 tab" -> the number of units per intake (or null). */
export function parseDose(text) {
  const t = String(text || "").trim().replace("½", "0.5").replace("¼", "0.25");
  let m = t.match(/^(\d+)\s*\/\s*(\d+)/);
  if (m && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  m = t.match(/^\d*\.?\d+/);
  return m ? Number(m[0]) : null;
}

/** { qty, formula } — qty is null when it cannot be worked out (SOS / custom / missing days): the doctor enters it. */
export function calcQuantity({ dose, frequency, days }) {
  const f = FREQUENCIES.find((x) => x.code === frequency);
  const d = parseDose(dose);
  if (!f || d == null || d <= 0 || f.times == null) return { qty: null, formula: "" };
  if (f.once) {
    const qty = Math.ceil(d);
    return { qty, formula: `${d} × once = ${qty}` };
  }
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return { qty: null, formula: "" };
  const qty = Math.ceil(d * f.times * n);
  return { qty, formula: `${d} × ${f.times}/day × ${n} day${n === 1 ? "" : "s"} = ${qty}` };
}
