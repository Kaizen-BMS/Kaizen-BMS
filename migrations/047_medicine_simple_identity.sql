-- One simple medicine identity: `name` stays the single display name used
-- everywhere ("Cap Betadine 500 mg"); `base_name` keeps the bare brand/generic
-- the pharmacist typed so the display name can be re-composed on edit.
-- Location is one free-text field now — widen rack so "Rack A - Shelf 3" fits.
ALTER TABLE medicines ADD COLUMN base_name VARCHAR(191) NULL;
UPDATE medicines SET base_name = name WHERE base_name IS NULL;
ALTER TABLE medicines MODIFY COLUMN rack VARCHAR(60) NULL;
ALTER TABLE pharmacy_stock MODIFY COLUMN rack VARCHAR(60) NULL;
