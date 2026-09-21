-- Staff details (for attendance photo matching) + independent-lab catalogue and walk-in orders.
ALTER TABLE staff_profiles
  ADD COLUMN address VARCHAR(500) NULL,
  ADD COLUMN native_place VARCHAR(191) NULL,
  ADD COLUMN aadhaar_no VARCHAR(20) NULL,
  ADD COLUMN emergency_contact VARCHAR(64) NULL,
  ADD COLUMN photo_url MEDIUMTEXT NULL;

ALTER TABLE staff_members
  ADD COLUMN address VARCHAR(500) NULL,
  ADD COLUMN native_place VARCHAR(191) NULL,
  ADD COLUMN aadhaar_no VARCHAR(20) NULL,
  ADD COLUMN photo_url MEDIUMTEXT NULL;

-- A lab's own test list. Name / price / GST / on-off live in the price list
-- (services + tariffs, type LAB); this holds the lab-only details.
CREATE TABLE lab_tests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  sample_type VARCHAR(60) NULL,
  units VARCHAR(64) NULL,
  reference_range VARCHAR(191) NULL,
  turnaround_hours INT UNSIGNED NULL,
  instructions VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_tests_service (service_id),
  KEY idx_lab_tests_tenant (tenant_id),
  CONSTRAINT fk_lab_tests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_tests_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
);

-- Orders that do not come from a doctor's consultation (walk-in / outside doctor).
ALTER TABLE lab_orders
  MODIFY consultation_id BIGINT UNSIGNED NULL,
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'DOCTOR',
  ADD COLUMN referred_by VARCHAR(191) NULL,
  ADD COLUMN bill_id BIGINT UNSIGNED NULL;
