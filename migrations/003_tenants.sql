-- 003_tenants.sql — generalize the hospital-only concept into Tenant + type,
-- rename hospital_modules -> tenant_modules and every hospital_id -> tenant_id,
-- add the owner roles for solo packs, add print_branding.
--
-- LOCAL DEV ONLY via the build process. The project owner applies this to
-- production manually (CLAUDE.md "Production database rule"). DDL statements
-- auto-commit individually — if a run fails partway, restore from the
-- pre-003 state before retrying.
--
-- Index names that still read "hospital" (e.g. idx_patients_hospital) are
-- left as-is on purpose: MariaDB 10.4 (dev) has no RENAME INDEX. The column
-- they index is renamed by CHANGE COLUMN, so they keep working.

-- ── 1. Drop every tenant/hospital foreign key so columns can be renamed ──
ALTER TABLE bills              DROP FOREIGN KEY fk_bills_hospital;
ALTER TABLE consultations      DROP FOREIGN KEY fk_consultations_hospital;
ALTER TABLE follow_ups         DROP FOREIGN KEY fk_follow_ups_hospital;
ALTER TABLE form_templates     DROP FOREIGN KEY fk_form_templates_hospital;
ALTER TABLE hospital_modules   DROP FOREIGN KEY fk_hospital_modules_hospital;
ALTER TABLE lab_orders         DROP FOREIGN KEY fk_lab_orders_hospital;
ALTER TABLE patients           DROP FOREIGN KEY fk_patients_hospital;
ALTER TABLE pharmacy_stock     DROP FOREIGN KEY fk_stock_hospital;
ALTER TABLE prescriptions      DROP FOREIGN KEY fk_prescriptions_hospital;
ALTER TABLE prescription_items DROP FOREIGN KEY fk_presc_items_hospital;
ALTER TABLE users              DROP FOREIGN KEY fk_users_hospital;
ALTER TABLE visits             DROP FOREIGN KEY fk_visits_hospital;

-- ── 2. hospitals -> tenants, with type / active / branding flag ──
ALTER TABLE hospitals
  ADD COLUMN type ENUM('HOSPITAL','DOCTOR_SOLO','PHARMACY_SOLO','LAB_SOLO')
    NOT NULL DEFAULT 'HOSPITAL' AFTER name,
  ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER type,
  ADD COLUMN allow_doctor_branding TINYINT(1) NOT NULL DEFAULT 0 AFTER active,
  ADD COLUMN contact_email VARCHAR(191) NULL AFTER allow_doctor_branding,
  ADD COLUMN contact_phone VARCHAR(64) NULL AFTER contact_email;
RENAME TABLE hospitals TO tenants;

-- ── 3. hospital_modules -> tenant_modules ──
RENAME TABLE hospital_modules TO tenant_modules;

-- ── 4. hospital_id -> tenant_id everywhere + re-add FKs to tenants ──
ALTER TABLE tenant_modules
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_tenant_modules_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE users
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE patients
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_patients_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE consultations
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_consultations_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE prescriptions
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_prescriptions_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE prescription_items
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_presc_items_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE pharmacy_stock
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_stock_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE bills
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_bills_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE form_templates
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_form_templates_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE visits
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_visits_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE lab_orders
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_lab_orders_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE follow_ups
  CHANGE hospital_id tenant_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_follow_ups_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE;

-- ── 5. Owner roles for solo packs ──
ALTER TABLE users
  MODIFY role ENUM(
    'SUPER_ADMIN','HOSPITAL_ADMIN','DOCTOR','PHARMACIST','LAB_TECH',
    'BILLING_STAFF','RECEPTIONIST',
    'OWNER_DOCTOR','OWNER_PHARMACIST','OWNER_LAB_TECH'
  ) NOT NULL;

-- ── 6. Print branding (prescriptions, lab reports, receipts) ──
CREATE TABLE IF NOT EXISTS print_branding (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  scope          ENUM('TENANT','DOCTOR') NOT NULL DEFAULT 'TENANT',
  doctor_user_id BIGINT UNSIGNED NULL,
  header_name    VARCHAR(191) NOT NULL,
  logo_url       VARCHAR(500) NULL,
  qualifications VARCHAR(255) NULL,
  address        VARCHAR(500) NULL,
  phone          VARCHAR(64) NULL,
  footer_text    VARCHAR(500) NULL,
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                   ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_print_branding_doctor (tenant_id, doctor_user_id),
  KEY idx_print_branding_tenant (tenant_id),
  CONSTRAINT fk_print_branding_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_print_branding_doctor FOREIGN KEY (doctor_user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
