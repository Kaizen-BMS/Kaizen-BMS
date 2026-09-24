-- Radiology ordered like Lab: a catalog of studies (modality, body part, prep, TAT),
-- study sets (e.g. "Chest X-ray PA + Lateral"), and a proper requisition on each order
-- (clinical indication, laterality, contrast, pregnancy, safety screening, mobility, notes).
-- Pricing keeps using the existing Service/Tariff Master (service_type RADIOLOGY).
CREATE TABLE radiology_tests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  modality VARCHAR(20) NOT NULL,
  body_part VARCHAR(80) NULL,
  contrast_option VARCHAR(12) NOT NULL DEFAULT 'NONE',
  preparation VARCHAR(500) NULL,
  turnaround_hours INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_radiology_tests_service (service_id),
  KEY idx_radiology_tests_tenant (tenant_id),
  CONSTRAINT fk_radiology_tests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_radiology_tests_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
);
CREATE TABLE radiology_panels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  modality VARCHAR(20) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_radiology_panels_name (tenant_id, name),
  KEY idx_radiology_panels_tenant (tenant_id),
  CONSTRAINT fk_radiology_panels_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
CREATE TABLE radiology_panel_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  panel_id BIGINT UNSIGNED NOT NULL,
  study_name VARCHAR(191) NOT NULL,
  service_id BIGINT UNSIGNED NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_radiology_panel_items_panel (panel_id),
  KEY idx_radiology_panel_items_tenant (tenant_id),
  CONSTRAINT fk_radiology_panel_items_panel FOREIGN KEY (panel_id) REFERENCES radiology_panels (id) ON DELETE CASCADE,
  CONSTRAINT fk_radiology_panel_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
ALTER TABLE radiology_orders
  ADD COLUMN modality VARCHAR(20) NULL,
  ADD COLUMN body_part VARCHAR(80) NULL,
  ADD COLUMN laterality VARCHAR(8) NOT NULL DEFAULT 'NA',
  ADD COLUMN contrast VARCHAR(12) NULL,
  ADD COLUMN clinical_indication VARCHAR(500) NULL,
  ADD COLUMN pregnancy_status VARCHAR(16) NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN safety_flags VARCHAR(255) NULL,
  ADD COLUMN mobility VARCHAR(12) NOT NULL DEFAULT 'WALKING',
  ADD COLUMN instructions VARCHAR(500) NULL;
