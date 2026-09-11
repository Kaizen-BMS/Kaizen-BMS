-- 005_safety_and_queue.sql — allergy flag, ABHA ID reservation, queue token
-- number, and the audit trail for an overridden allergy warning. Layered on
-- top of 001-004.
--
-- Applied to a LOCAL TEST COPY ONLY by the build process. The project owner
-- applies this to the real database by hand — see CLAUDE.md "Database rule".

ALTER TABLE patients
  ADD COLUMN allergies JSON NULL AFTER custom_fields,
  ADD COLUMN abha_id VARCHAR(64) NULL AFTER allergies;

-- Sequential per-tenant, per-day queue token, assigned at check-in.
ALTER TABLE visits
  ADD COLUMN token_number INT UNSIGNED NULL AFTER entry_type;

-- Audit trail: a doctor explicitly overrode an allergy-match warning on a
-- specific prescription line. Append-only, never edited or deleted.
CREATE TABLE IF NOT EXISTS prescription_item_acks (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id              BIGINT UNSIGNED NOT NULL,
  prescription_item_id   BIGINT UNSIGNED NOT NULL,
  warning                VARCHAR(500) NOT NULL,
  acknowledged_by        BIGINT UNSIGNED NOT NULL,
  acknowledged_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_presc_acks_tenant (tenant_id),
  KEY idx_presc_acks_item (prescription_item_id),
  CONSTRAINT fk_presc_acks_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_presc_acks_item FOREIGN KEY (prescription_item_id)
    REFERENCES prescription_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_presc_acks_user FOREIGN KEY (acknowledged_by)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
