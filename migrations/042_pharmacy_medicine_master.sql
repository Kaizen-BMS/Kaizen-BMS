-- Pharmacy: Medicine Master, batch detail (rate/rack/supplier/mfg date),
-- Suppliers, a simplified GRN (goods receipt), stock transfer between
-- pharmacy instances, customer/supplier returns, and a structured reason on
-- manual adjustments. Every table is additive; nothing already working is
-- touched. See CLAUDE.md "Pharmacy inventory" for the pre-existing model
-- this extends (pharmacy_stock / pharmacy_stock_movements / pharmacy_thresholds).

-- Medicine Master: the medicine's own identity, separate from a physical
-- batch of it in stock. `gst_rate` is the flat, medicine-level GST used
-- to price a retail sale (a pharmacy's catalogue is hundreds of SKUs —
-- routing every one through the clinical Service/Tariff Master, built for
-- a handful of billable service types, would be the wrong tool; the exact
-- same Decimal-safe tax math in src/lib/pricing.js is reused either way).
CREATE TABLE medicines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(191) NOT NULL,
  generic_name VARCHAR(191) NULL,
  brand_name VARCHAR(191) NULL,
  medicine_type VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  strength VARCHAR(60) NULL,
  dosage_form VARCHAR(60) NULL,
  manufacturer VARCHAR(191) NULL,
  composition VARCHAR(255) NULL,
  category VARCHAR(100) NULL,
  schedule VARCHAR(20) NULL,
  prescription_required TINYINT(1) NOT NULL DEFAULT 0,
  barcode VARCHAR(64) NULL,
  hsn_code VARCHAR(20) NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  pack_size VARCHAR(60) NULL,
  unit VARCHAR(30) NULL,
  reorder_level INT UNSIGNED NOT NULL DEFAULT 10,
  max_stock INT UNSIGNED NULL,
  rack VARCHAR(20) NULL,
  shelf VARCHAR(20) NULL,
  bin VARCHAR(20) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_medicines_tenant (tenant_id),
  KEY idx_medicines_tenant_name (tenant_id, name),
  KEY idx_medicines_tenant_barcode (tenant_id, barcode),
  CONSTRAINT fk_medicines_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- Suppliers this pharmacy buys from.
CREATE TABLE suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(191) NOT NULL,
  company_name VARCHAR(191) NULL,
  contact_person VARCHAR(191) NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(191) NULL,
  address VARCHAR(500) NULL,
  gstin VARCHAR(20) NULL,
  drug_licence_no VARCHAR(60) NULL,
  payment_terms VARCHAR(100) NULL,
  credit_days INT UNSIGNED NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_suppliers_tenant (tenant_id),
  CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- A simplified goods-receipt: stock physically arriving from a supplier.
-- (A full Purchase-Order → pending-delivery → reconciliation pipeline is
-- deliberately not built this pass — see the final report; this is the
-- receiving step itself, which is what actually creates real batches.)
CREATE TABLE grns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  module_instance_id BIGINT UNSIGNED NULL,
  grn_number VARCHAR(40) NOT NULL,
  grn_date DATE NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  supplier_invoice_number VARCHAR(80) NULL,
  supplier_invoice_date DATE NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grns_tenant_number (tenant_id, grn_number),
  KEY idx_grns_tenant (tenant_id),
  KEY idx_grns_supplier (supplier_id),
  CONSTRAINT fk_grns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_grns_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL
);

CREATE TABLE grn_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  grn_id BIGINT UNSIGNED NOT NULL,
  medicine_id BIGINT UNSIGNED NOT NULL,
  batch_number VARCHAR(80) NOT NULL,
  manufacturing_date DATE NULL,
  expiry_date DATE NULL,
  received_quantity INT UNSIGNED NOT NULL,
  free_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  damaged_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  purchase_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  mrp DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  accepted_quantity INT UNSIGNED NOT NULL,
  rejected_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  stock_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_grn_items_grn (grn_id),
  KEY idx_grn_items_tenant (tenant_id),
  KEY idx_grn_items_medicine (medicine_id),
  CONSTRAINT fk_grn_items_grn FOREIGN KEY (grn_id) REFERENCES grns (id) ON DELETE CASCADE,
  CONSTRAINT fk_grn_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_grn_items_medicine FOREIGN KEY (medicine_id) REFERENCES medicines (id) ON DELETE CASCADE
);

-- Stock moved from one pharmacy instance to another (e.g. Main -> Emergency).
CREATE TABLE stock_transfers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  medicine_id BIGINT UNSIGNED NULL,
  from_instance_id BIGINT UNSIGNED NOT NULL,
  to_instance_id BIGINT UNSIGNED NOT NULL,
  from_stock_id BIGINT UNSIGNED NOT NULL,
  to_stock_id BIGINT UNSIGNED NOT NULL,
  batch_number VARCHAR(80) NULL,
  quantity INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NULL,
  performed_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transfers_tenant (tenant_id),
  CONSTRAINT fk_transfers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- A sold item coming back (against a real prior sale/dispense).
CREATE TABLE customer_returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  bill_id BIGINT UNSIGNED NULL,
  bill_item_id BIGINT UNSIGNED NULL,
  prescription_item_id BIGINT UNSIGNED NULL,
  stock_id BIGINT UNSIGNED NOT NULL,
  medicine_id BIGINT UNSIGNED NULL,
  quantity INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NOT NULL,
  refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  refund_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_returns_tenant (tenant_id),
  KEY idx_customer_returns_bill (bill_id),
  CONSTRAINT fk_customer_returns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- Stock going back to the supplier.
CREATE TABLE supplier_returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  stock_id BIGINT UNSIGNED NOT NULL,
  medicine_id BIGINT UNSIGNED NULL,
  supplier_id BIGINT UNSIGNED NULL,
  quantity INT UNSIGNED NOT NULL,
  reason ENUM('EXPIRED','DAMAGED','WRONG_MEDICINE','WRONG_BATCH','OTHER') NOT NULL,
  notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_supplier_returns_tenant (tenant_id),
  CONSTRAINT fk_supplier_returns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- pharmacy_stock: link to the Medicine Master + per-batch commercial/location
-- detail + provenance. `medicine_name` is kept exactly as-is (still what
-- FEFO dispensing matches on) — medicine_id is additive, nullable, backfilled.
ALTER TABLE pharmacy_stock
  ADD COLUMN medicine_id BIGINT UNSIGNED NULL AFTER module_instance_id,
  ADD COLUMN manufacturing_date DATE NULL AFTER expiry_date,
  ADD COLUMN purchase_rate DECIMAL(12,2) NULL,
  ADD COLUMN mrp DECIMAL(12,2) NULL,
  ADD COLUMN selling_rate DECIMAL(12,2) NULL,
  ADD COLUMN rack VARCHAR(20) NULL,
  ADD COLUMN shelf VARCHAR(20) NULL,
  ADD COLUMN bin VARCHAR(20) NULL,
  ADD COLUMN supplier_id BIGINT UNSIGNED NULL,
  ADD COLUMN grn_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_pharmacy_stock_medicine FOREIGN KEY (medicine_id) REFERENCES medicines (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_pharmacy_stock_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
  ADD KEY idx_pharmacy_stock_medicine (medicine_id);

-- A structured reason on manual stock movements (damaged/expired write-off/
-- returns/transfers), on top of the existing free-text `reason`. More
-- movement types, plus which return/transfer row (if any) a movement
-- belongs to, so a batch's full history stays reconstructable.
ALTER TABLE pharmacy_stock_movements
  MODIFY COLUMN type ENUM('IN','DISPENSE','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','CUSTOMER_RETURN','SUPPLIER_RETURN','DAMAGED','EXPIRED_WRITEOFF') NOT NULL,
  ADD COLUMN reference_type VARCHAR(30) NULL,
  ADD COLUMN reference_id BIGINT UNSIGNED NULL;

-- pharmacy_thresholds: a maximum stock level alongside the existing
-- low-stock reorder level (both were meant to live together per the
-- Medicine Master; kept on this existing table rather than duplicated
-- onto `medicines` too, since this is still the one place a threshold is
-- read/written).
ALTER TABLE pharmacy_thresholds
  ADD COLUMN max_stock INT UNSIGNED NULL;

-- Pharmacy sale lines carry which batch was actually sold — the historical
-- record, same "the row IS the record" principle as consultations/
-- bill_items already use for their own price snapshots (CLAUDE.md
-- "Pricing / Tariff"). Never overwrites the item; purely additive.
ALTER TABLE bill_items
  ADD COLUMN stock_id BIGINT UNSIGNED NULL,
  ADD COLUMN medicine_id BIGINT UNSIGNED NULL,
  ADD COLUMN batch_number VARCHAR(80) NULL,
  ADD COLUMN expiry_date DATE NULL,
  ADD COLUMN mrp DECIMAL(12,2) NULL;

-- Backfill: every medicine name already in stock (from before this master
-- existed) gets a real Medicine Master row, type OTHER (nobody has said
-- what type it actually is yet — an admin corrects it later, same
-- "backfilled, never guessed" discipline as every other phase's backfill
-- in this project). Existing batches are linked to it.
INSERT INTO medicines (tenant_id, name, medicine_type, reorder_level, created_at, updated_at)
SELECT DISTINCT tenant_id, medicine_name, 'OTHER', 10, NOW(), NOW()
FROM pharmacy_stock
WHERE medicine_name IS NOT NULL AND medicine_name <> '';

UPDATE pharmacy_stock ps
JOIN medicines m ON m.tenant_id = ps.tenant_id AND m.name = ps.medicine_name
SET ps.medicine_id = m.id
WHERE ps.medicine_id IS NULL;

-- Existing thresholds (set per medicine NAME) also get a reorder_level on
-- the new Medicine Master row, so the two stay consistent from day one.
UPDATE medicines m
JOIN pharmacy_thresholds t ON t.tenant_id = m.tenant_id AND t.medicine_name = m.name
SET m.reorder_level = t.low_stock_threshold;
