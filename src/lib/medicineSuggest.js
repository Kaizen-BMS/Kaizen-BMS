"use strict";

/**
 * Type-ahead for medicines. Searches display name, generic/salt, brand,
 * barcode and composition; names that START with what was typed rank first.
 * Each hit carries usable stock (non-expired units) so the doctor/pharmacist
 * sees availability without leaving the field. Tenant-scoped explicitly.
 */
const { tenantDb } = require("./prismaClient");

async function suggestMedicines(tenantId, rawQuery, limit = 8) {
  const q = String(rawQuery || "").trim();
  if (q.length < 1) return [];
  const clean = q.replace(/[%_]/g, "");
  const like = `%${clean}%`;
  const starts = `${clean}%`;
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT m.id, m.name, m.medicine_type AS type, m.strength, m.generic_name AS generic, m.unit, m.purchase_unit, m.units_per_purchase,
            COALESCE((SELECT SUM(ps.quantity) FROM pharmacy_stock ps
                       WHERE ps.tenant_id = m.tenant_id AND ps.medicine_id = m.id
                         AND (ps.expiry_date IS NULL OR ps.expiry_date >= CURDATE())), 0) AS stock
       FROM medicines m
      WHERE m.tenant_id = ? AND m.active = 1
        AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.brand_name LIKE ? OR m.base_name LIKE ?
             OR m.composition LIKE ? OR m.barcode = ?)
      ORDER BY (m.name LIKE ?) DESC, (m.base_name LIKE ?) DESC, m.name ASC
      LIMIT ${Number(limit) | 0}`,
    BigInt(tenantId), like, like, like, like, like, q, starts, starts,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    type: r.type,
    strength: r.strength,
    generic: r.generic,
    stock: Number(r.stock),
    unit: r.unit || null,
    purchaseUnit: r.purchase_unit || null,
    unitsPerPurchase: Number(r.units_per_purchase || 1),
  }));
}

module.exports = { suggestMedicines };
