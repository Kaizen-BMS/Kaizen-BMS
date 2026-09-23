-- Ward configuration used to be a fixed 3-value ENUM (GENERAL/PRIVATE/ICU)
-- on `beds.ward_type` — real hospitals don't all shape their floors that
-- way, so this makes wards a real per-tenant master (name + floor), same
-- "code is code-defined only where it has to be, the list itself is tenant
-- data" split already used for `departments`/`referral_sources`.
CREATE TABLE wards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  floor VARCHAR(50) NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wards_tenant_code (tenant_id, code),
  KEY idx_wards_tenant (tenant_id),
  CONSTRAINT fk_wards_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- `beds.ward_type` widens from the 3-value ENUM to a free code string
-- (still the exact same stored values for every existing row — an ENUM's
-- values ARE plain strings under the hood, so this is lossless) so a bed
-- can reference any ward a hospital has defined, not just the original 3.
-- The existing (tenant_id, ward_type, bed_number) uniqueness is unaffected
-- by the type change.
ALTER TABLE beds MODIFY COLUMN ward_type VARCHAR(30) NOT NULL;

-- Backfill: every existing HOSPITAL tenant gets the same 3 wards its beds
-- already used, as real editable rows, so no existing bed becomes
-- orphaned from a ward row and nothing on the Bed Board regresses.
INSERT INTO wards (tenant_id, code, name, floor, display_order)
SELECT id, 'GENERAL', 'General Ward', NULL, 1 FROM tenants WHERE type = 'HOSPITAL';
INSERT INTO wards (tenant_id, code, name, floor, display_order)
SELECT id, 'PRIVATE', 'Private Rooms', NULL, 2 FROM tenants WHERE type = 'HOSPITAL';
INSERT INTO wards (tenant_id, code, name, floor, display_order)
SELECT id, 'ICU', 'ICU', NULL, 3 FROM tenants WHERE type = 'HOSPITAL';
