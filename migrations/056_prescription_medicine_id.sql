-- prescription_items.medicine_name is freeform text (whatever the doctor typed or picked), while
-- pharmacy_stock.medicine_name is the catalog-composed display name (medicineName.js's
-- composeMedicineName). The two can diverge byte-for-byte ("Omeprazole 20mg" vs "Tab Omeprazole
-- 20mg") even for the exact same medicine, which silently breaks dispense's exact-string FEFO
-- match (item sits at OUT_OF_STOCK/0-dispensed despite real stock existing). This nullable FK to
-- medicines (same column already present on pharmacy_stock) lets a picked suggestion be matched
-- by id first, falling back to the existing name match for any row/typed entry with no id captured
-- — never a breaking change for existing data.
ALTER TABLE prescription_items
  ADD COLUMN medicine_id BIGINT UNSIGNED NULL AFTER medicine_name,
  ADD INDEX idx_prescription_items_medicine_id (medicine_id);
