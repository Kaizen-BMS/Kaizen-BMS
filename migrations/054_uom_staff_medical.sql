-- Purchase packaging: a medicine is stocked and sold in its stock unit (unit, e.g. Strip) but often bought
-- in a larger one (purchase_unit, e.g. Box = 10 Strips). units_per_purchase is that conversion; 1 = no conversion.
ALTER TABLE medicines
  ADD COLUMN purchase_unit VARCHAR(30) NULL AFTER unit,
  ADD COLUMN units_per_purchase INT UNSIGNED NOT NULL DEFAULT 1 AFTER purchase_unit;

-- Staff medical notes: privacy-sensitive free text, only ever shown to staff:manage and the person themselves.
ALTER TABLE staff_profiles ADD COLUMN medical_notes TEXT NULL AFTER blood_group;
