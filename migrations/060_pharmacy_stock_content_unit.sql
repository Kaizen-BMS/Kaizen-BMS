-- Pharmacy stock is tracked in whole PACKS (Strips, Bottles, Tubes) today —
-- pharmacy_stock.quantity is a pack count. Billing/dispensing, though,
-- needs to sell/give exactly what was asked for (e.g. 3 tablets from a
-- strip of 10), which a pack-denominated count can never represent
-- correctly. This migration moves the canonical stock unit down to the
-- medicine's smallest CONTENT unit (Tablet, ml, ...) instead — the one
-- thing that changes; purchase_rate/mrp/selling_rate are DELIBERATELY left
-- untouched (they always stay per-pack, the real printed/invoiced number —
-- see src/lib/pharmacyPricing.js's perContentUnitRate(), which now does
-- the pack->content rate conversion at the point of sale instead).
--
-- Only medicines with a real, known content_per_pack > 1 are rescaled — a
-- medicine sold as single units already (content_per_pack NULL or 1) needs
-- no change, since its pack unit already IS its content unit.
--
-- Backed up automatically by scripts/dbApplyGuard.js before this runs.

UPDATE pharmacy_stock ps
  JOIN medicines m ON m.id = ps.medicine_id
  SET ps.quantity = ps.quantity * m.content_per_pack
  WHERE m.content_per_pack IS NOT NULL AND m.content_per_pack > 1;

UPDATE medicines
  SET reorder_level = reorder_level * content_per_pack
  WHERE content_per_pack IS NOT NULL AND content_per_pack > 1;

UPDATE medicines
  SET max_stock = max_stock * content_per_pack
  WHERE max_stock IS NOT NULL AND content_per_pack IS NOT NULL AND content_per_pack > 1;

-- pharmacy_thresholds is keyed by medicine_name (no medicine_id column), so
-- the join has to go through the name, same as every live query against it.
UPDATE pharmacy_thresholds t
  JOIN medicines m ON m.tenant_id = t.tenant_id AND m.name = t.medicine_name
  SET t.low_stock_threshold = t.low_stock_threshold * m.content_per_pack
  WHERE m.content_per_pack IS NOT NULL AND m.content_per_pack > 1;

UPDATE pharmacy_thresholds t
  JOIN medicines m ON m.tenant_id = t.tenant_id AND m.name = t.medicine_name
  SET t.max_stock = t.max_stock * m.content_per_pack
  WHERE t.max_stock IS NOT NULL AND m.content_per_pack IS NOT NULL AND m.content_per_pack > 1;
