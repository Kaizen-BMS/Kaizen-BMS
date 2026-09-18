-- 032_radiology.sql — Radiology module (the next major phase after
-- Workflow Automation / Alerts & Notifications Center). Makes RADIOLOGY a
-- genuinely rentable module (moduleRegistry.js already listed it as
-- "planned" since the Super Admin phase) with real orders, reusing the
-- EXISTING Service/Tariff Master for pricing — services.service_type
-- already had a RADIOLOGY value since migration 027 (Phase 6), so zero
-- billing schema is needed beyond one new bill_items_source value for the
-- unmapped-fallback case (same shape as the existing LAB/PHARMACY
-- fallback sources).
--
-- Four additive ENUM extensions (existing rows are completely unaffected —
-- MySQL/MariaDB ENUM columns keep every existing stored value valid when
-- you only ADD a new allowed value) plus one new table:
--   1. users.role                    + RADIOLOGY_STAFF
--   2. tenant_modules.module_name    + RADIOLOGY
--   3. module_instances.module_name  + RADIOLOGY
--   4. bill_items.source             + RADIOLOGY
--   5. radiology_orders (new table)
--
-- Deliberately NOT done here (see CLAUDE.md "Radiology module" for the
-- reasoning): no new tenant type (a standalone Radiology-solo tenant is
-- flagged as future work, same as every other "if genuinely required"
-- scope cut in this project); no form_templates_form_type addition (no
-- custom_fields column on radiology_orders — this phase's own "do not
-- create unnecessary state complexity" instruction); no separate
-- radiology_reports table (findings/impression/reportedBy/reportedAt live
-- directly on the order row, mirroring how lab_orders keeps `results` on
-- the order itself rather than a child table).

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'SUPER_ADMIN','HOSPITAL_ADMIN','DOCTOR','PHARMACIST','LAB_TECH',
    'BILLING_STAFF','RECEPTIONIST','NURSE','OWNER_DOCTOR','OWNER_PHARMACIST',
    'OWNER_LAB_TECH','RADIOLOGY_STAFF'
  ) NOT NULL;

ALTER TABLE tenant_modules
  MODIFY COLUMN module_name ENUM(
    'PHARMACY','DOCTOR_OPD','LAB','BILLING','IPD','APPOINTMENTS','RADIOLOGY'
  ) NOT NULL;

ALTER TABLE module_instances
  MODIFY COLUMN module_name ENUM(
    'PHARMACY','DOCTOR_OPD','LAB','BILLING','IPD','APPOINTMENTS','RADIOLOGY'
  ) NOT NULL;

ALTER TABLE bill_items
  MODIFY COLUMN source ENUM(
    'CONSULTATION','PHARMACY','LAB','IPD_ROOM','SERVICE','RADIOLOGY'
  ) NOT NULL;

-- Mirrors lab_orders' own shape closely (visit_id nullable, consultation_id
-- + patient_id required — a radiology order, like a lab order, is always
-- placed from a consultation) but ONE study per order rather than a JSON
-- array of tests: real-world radiology ordering is per-study ("CT Head"),
-- and this also keeps the price/report/status lifecycle attached to
-- exactly one row instead of needing a child-items table the way Lab
-- needed lab_order_items for its bundled-tests case.
CREATE TABLE IF NOT EXISTS radiology_orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id       BIGINT UNSIGNED NOT NULL,
  visit_id        BIGINT UNSIGNED NULL,
  consultation_id BIGINT UNSIGNED NOT NULL,
  patient_id      BIGINT UNSIGNED NOT NULL,
  -- Optional, explicit Service Master link (RADIOLOGY-type service) — set,
  -- or not, at ordering time; NEVER inferred from study_name text at
  -- billing time, same Phase 7 discipline as prescription_items.service_id
  -- / lab_order_items.service_id.
  service_id      BIGINT UNSIGNED NULL,
  study_name      VARCHAR(191) NOT NULL,
  priority        ENUM('ROUTINE','URGENT','STAT') NOT NULL DEFAULT 'ROUTINE',
  status          ENUM('ORDERED','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ORDERED',
  scheduled_at    DATETIME(3) NULL,
  started_at      DATETIME(3) NULL,
  completed_at    DATETIME(3) NULL,
  cancelled_at    DATETIME(3) NULL,
  cancel_reason   VARCHAR(255) NULL,
  findings        TEXT NULL,
  impression      TEXT NULL,
  ordered_by      BIGINT UNSIGNED NULL,
  performed_by    BIGINT UNSIGNED NULL,
  reported_by     BIGINT UNSIGNED NULL,
  reported_at     DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_radiology_orders_tenant (tenant_id),
  KEY idx_radiology_orders_tenant_status (tenant_id, status),
  KEY idx_radiology_orders_consultation (consultation_id),
  KEY idx_radiology_orders_visit (visit_id),
  KEY idx_radiology_orders_patient (patient_id),
  KEY idx_radiology_orders_service (service_id),
  CONSTRAINT fk_radiology_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_radiology_orders_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  CONSTRAINT fk_radiology_orders_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_radiology_orders_visit FOREIGN KEY (visit_id) REFERENCES visits(id),
  CONSTRAINT fk_radiology_orders_service FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_radiology_orders_ordered_by FOREIGN KEY (ordered_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_radiology_orders_performed_by FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_radiology_orders_reported_by FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
