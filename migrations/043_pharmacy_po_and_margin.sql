-- Purchase Orders (the step BEFORE a GRN — CLAUDE.md Pharmacy inventory
-- follow-up), and a cost-basis snapshot on pharmacy sale lines so a real
-- margin report is possible (revenue minus what the stock actually cost,
-- not today's purchase rate which may have since changed).

CREATE TABLE purchase_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  module_instance_id BIGINT UNSIGNED NULL,
  po_number VARCHAR(40) NOT NULL,
  po_date DATE NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  expected_delivery_date DATE NULL,
  status ENUM('DRAFT','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_po_tenant_number (tenant_id, po_number),
  KEY idx_po_tenant (tenant_id),
  KEY idx_po_supplier (supplier_id),
  CONSTRAINT fk_po_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL
);

CREATE TABLE purchase_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  po_id BIGINT UNSIGNED NOT NULL,
  medicine_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  free_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  purchase_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(255) NULL,
  received_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_poi_po (po_id),
  KEY idx_poi_tenant (tenant_id),
  CONSTRAINT fk_poi_po FOREIGN KEY (po_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_medicine FOREIGN KEY (medicine_id) REFERENCES medicines (id) ON DELETE CASCADE
);

-- A GRN can (optionally) be receiving against a real PO — additive, a GRN
-- with no PO (today's only path) keeps working unchanged.
ALTER TABLE grns
  ADD COLUMN po_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_grns_po FOREIGN KEY (po_id) REFERENCES purchase_orders (id) ON DELETE SET NULL;

-- Cost-basis snapshot on a pharmacy sale line, same "never recompute
-- history from a value that can later change" principle as the existing
-- `mrp` snapshot column added alongside it in migration 042.
ALTER TABLE bill_items
  ADD COLUMN purchase_rate DECIMAL(12,2) NULL;
