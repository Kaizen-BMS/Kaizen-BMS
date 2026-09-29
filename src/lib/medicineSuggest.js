"use strict";

/**
 * Type-ahead for medicines. Searches display name, generic/salt, brand,
 * barcode and composition; names that START with what was typed rank first.
 * Each hit carries usable stock (non-expired units) so the doctor/pharmacist
 * sees availability without leaving the field. Tenant-scoped explicitly.
 */
const { tenantDb } = require("./prismaClient");
const { perContentUnitRate } = require("./pharmacyPricing");

async function suggestMedicines(tenantId, rawQuery, limit = 8) {
  const q = String(rawQuery || "").trim();
  if (q.length < 1) return [];
  const clean = q.replace(/[%_]/g, "");
  const like = `%${clean}%`;
  const starts = `${clean}%`;
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT m.id, m.name, m.medicine_type AS type, m.strength, m.generic_name AS generic, m.unit, m.content_unit, m.content_per_pack, m.purchase_unit, m.units_per_purchase,
            COALESCE((SELECT SUM(ps.quantity) FROM pharmacy_stock ps
                       WHERE ps.tenant_id = m.tenant_id AND ps.medicine_id = m.id
                         AND (ps.expiry_date IS NULL OR ps.expiry_date >= CURDATE())), 0) AS stock,
            (SELECT ps2.selling_rate FROM pharmacy_stock ps2
              WHERE ps2.tenant_id = m.tenant_id AND ps2.medicine_id = m.id AND ps2.quantity > 0
                AND (ps2.expiry_date IS NULL OR ps2.expiry_date >= CURDATE())
              ORDER BY (ps2.expiry_date IS NULL) ASC, ps2.expiry_date ASC, ps2.id ASC LIMIT 1) AS selling_rate,
            (SELECT ps2.mrp FROM pharmacy_stock ps2
              WHERE ps2.tenant_id = m.tenant_id AND ps2.medicine_id = m.id AND ps2.quantity > 0
                AND (ps2.expiry_date IS NULL OR ps2.expiry_date >= CURDATE())
              ORDER BY (ps2.expiry_date IS NULL) ASC, ps2.expiry_date ASC, ps2.id ASC LIMIT 1) AS mrp
       FROM medicines m
      WHERE m.tenant_id = ? AND m.active = 1
        AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.brand_name LIKE ? OR m.base_name LIKE ?
             OR m.composition LIKE ? OR m.barcode = ?)
      ORDER BY (m.name LIKE ?) DESC, (m.base_name LIKE ?) DESC, m.name ASC
      LIMIT ${Number(limit) | 0}`,
    BigInt(tenantId), like, like, like, like, like, q, starts, starts,
  );
  return rows.map((r) => {
    const packRate = r.selling_rate != null ? Number(r.selling_rate) : r.mrp != null ? Number(r.mrp) : null;
    return {
      id: Number(r.id),
      name: r.name,
      type: r.type,
      strength: r.strength,
      generic: r.generic,
      stock: Number(r.stock),
      unit: r.unit || null,
      contentUnit: r.content_unit || null,
      contentPerPack: r.content_per_pack || null,
      purchaseUnit: r.purchase_unit || null,
      unitsPerPurchase: Number(r.units_per_purchase || 1),
      // Content-unit-denominated (e.g. per Tablet) — see perContentUnitRate()'s own doc comment.
      sellingRate: perContentUnitRate(packRate, r.content_per_pack),
    };
  });
}

module.exports = { suggestMedicines };
