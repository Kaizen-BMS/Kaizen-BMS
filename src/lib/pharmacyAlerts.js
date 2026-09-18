"use strict";

/**
 * Shared low-stock/expiry computation — factored out of
 * GET /api/pharmacy/inventory (unchanged behavior/output shape there) so
 * the new Alerts Center (see src/lib/alerts.js) can reuse the exact same
 * rule instead of a second, possibly-drifting copy — same "one place this
 * can drift" discipline as resolveAndPriceService()/bookAppointment()
 * elsewhere in this codebase.
 */
const { EXPIRY_WARNING_DAYS } = require("./pharmacyConstants");

/**
 * `batches` = raw pharmacy_stock rows for one module instance.
 * `thresholds` = pharmacy_thresholds rows ({ medicine_name, low_stock_threshold }).
 * Returns the same `medicines` array shape the inventory route has always
 * returned: one entry per medicine name, its batches flagged
 * expired/expiringSoon, `totalQuantity`/`threshold`/`lowStock`.
 */
function computeMedicineAlerts(batches, thresholds) {
  const thresholdMap = new Map(thresholds.map((t) => [t.medicine_name, t.low_stock_threshold]));
  const warnBy = new Date();
  warnBy.setDate(warnBy.getDate() + EXPIRY_WARNING_DAYS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byMedicine = new Map();
  for (const b of batches) {
    const expiry = b.expiry_date ? new Date(b.expiry_date) : null;
    const flagged = {
      ...b,
      expired: !!expiry && expiry < today,
      expiringSoon: !!expiry && expiry >= today && expiry <= warnBy,
    };
    if (!byMedicine.has(b.medicine_name)) {
      byMedicine.set(b.medicine_name, {
        medicineName: b.medicine_name,
        totalQuantity: 0,
        threshold: thresholdMap.get(b.medicine_name) ?? 10,
        batches: [],
      });
    }
    const entry = byMedicine.get(b.medicine_name);
    entry.totalQuantity += b.quantity;
    entry.batches.push(flagged);
  }

  return [...byMedicine.values()]
    .map((m) => ({ ...m, lowStock: m.totalQuantity <= m.threshold }))
    .sort((a, b) => a.medicineName.localeCompare(b.medicineName));
}

module.exports = { computeMedicineAlerts };
