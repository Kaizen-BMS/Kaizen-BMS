-- 007_pharmacy_inventory.sql — full pharmacy inventory lifecycle: stock-IN,
-- low-stock thresholds, a unified stock-movement ledger (IN / DISPENSE /
-- ADJUSTMENT, so every manual adjustment carries a logged reason and every
-- dispense is traceable back to the prescription line and the batch(es) it
-- came from). Layered on top of 001-006.
--
-- Applied to a LOCAL TEST COPY ONLY by the build process. The project owner
-- applies this to the real database by hand — see CLAUDE.md "Database rule".

-- Prevent duplicate rows for the same medicine+batch — stock-IN of an
-- already-known batch increments the existing row instead.
ALTER TABLE pharmacy_stock
  ADD UNIQUE KEY uq_pharmacy_stock_batch (tenant_id, medicine_name, batch_number);

-- Per-medicine low-stock threshold (aggregate across all of that medicine's
-- batches, not per-batch).
CREATE TABLE IF NOT EXISTS pharmacy_thresholds (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id            BIGINT UNSIGNED NOT NULL,
  medicine_name        VARCHAR(191) NOT NULL,
  low_stock_threshold  INT UNSIGNED NOT NULL DEFAULT 10,
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                         ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pharmacy_thresholds (tenant_id, medicine_name),
  KEY idx_pharmacy_thresholds_tenant (tenant_id),
  CONSTRAINT fk_pharmacy_thresholds_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One ledger for the whole stock lifecycle. IN = stock-in receipt.
-- DISPENSE = consumed against a prescription line (prescription_item_id
-- set). ADJUSTMENT = manual correction, `reason` required (damaged/lost/
-- recount, etc.) — this IS the audit trail the adjustment screen writes to.
CREATE TABLE IF NOT EXISTS pharmacy_stock_movements (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id              BIGINT UNSIGNED NOT NULL,
  stock_id               BIGINT UNSIGNED NOT NULL,
  type                   ENUM('IN', 'DISPENSE', 'ADJUSTMENT') NOT NULL,
  quantity_delta         INT NOT NULL,
  reason                 VARCHAR(500) NULL,
  prescription_item_id   BIGINT UNSIGNED NULL,
  performed_by           BIGINT UNSIGNED NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_stock_movements_tenant (tenant_id),
  KEY idx_stock_movements_stock (stock_id),
  KEY idx_stock_movements_tenant_type (tenant_id, type),
  CONSTRAINT fk_stock_movements_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_movements_stock FOREIGN KEY (stock_id)
    REFERENCES pharmacy_stock(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_movements_item FOREIGN KEY (prescription_item_id)
    REFERENCES prescription_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_stock_movements_user FOREIGN KEY (performed_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
