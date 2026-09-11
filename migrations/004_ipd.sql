-- 004_ipd.sql — three entry points (OPD/Emergency/Direct Admission), the
-- IPD/admission branch (beds, admissions, consent forms, nursing notes).
-- Layered on top of 001-003.
--
-- Applied to a LOCAL TEST COPY ONLY by the build process. The project owner
-- applies this to the real database by hand — see CLAUDE.md "Database rule".

-- ── Visit: how the patient entered care ─────────────────────────────
-- Existing statuses are kept (REGISTERED/WITH_DOCTOR/PHARMACY/LAB/BILLING/
-- DISCHARGED/CANCELLED) so already-built OPD/Registration screens keep
-- working unchanged; TRIAGE and ADMITTED are added for the Emergency/IPD
-- branch this migration introduces.
ALTER TABLE visits
  ADD COLUMN entry_type ENUM('OPD', 'EMERGENCY', 'DIRECT_ADMISSION')
    NOT NULL DEFAULT 'OPD' AFTER patient_id,
  MODIFY status ENUM(
    'REGISTERED', 'TRIAGE', 'WITH_DOCTOR', 'PHARMACY', 'LAB', 'BILLING',
    'ADMITTED', 'DISCHARGED', 'CANCELLED'
  ) NOT NULL DEFAULT 'REGISTERED';

-- IPD becomes a rentable module like the other four.
ALTER TABLE tenant_modules
  MODIFY module_name ENUM('PHARMACY', 'DOCTOR_OPD', 'LAB', 'BILLING', 'IPD') NOT NULL;

-- ── Bed master list ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beds (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id   BIGINT UNSIGNED NOT NULL,
  ward_type   ENUM('GENERAL', 'PRIVATE', 'ICU') NOT NULL,
  bed_number  VARCHAR(50) NOT NULL,
  status      ENUM('VACANT', 'OCCUPIED', 'CLEANING', 'MAINTENANCE')
                NOT NULL DEFAULT 'VACANT',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_beds_tenant_ward_number (tenant_id, ward_type, bed_number),
  KEY idx_beds_tenant (tenant_id),
  KEY idx_beds_tenant_status (tenant_id, status),
  CONSTRAINT fk_beds_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Admissions (IPD stay) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admissions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id        BIGINT UNSIGNED NOT NULL,
  visit_id         BIGINT UNSIGNED NOT NULL,
  bed_id           BIGINT UNSIGNED NOT NULL,
  admitted_by      BIGINT UNSIGNED NULL,
  admitted_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  discharged_at    DATETIME(3) NULL,
  discharge_type   ENUM('ROUTINE', 'TRANSFER', 'AGAINST_MEDICAL_ADVICE', 'DEATH') NULL,
  discharge_notes  VARCHAR(2000) NULL,
  KEY idx_admissions_tenant (tenant_id),
  KEY idx_admissions_tenant_visit (tenant_id, visit_id),
  KEY idx_admissions_bed (bed_id),
  CONSTRAINT fk_admissions_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_admissions_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE CASCADE,
  CONSTRAINT fk_admissions_bed FOREIGN KEY (bed_id)
    REFERENCES beds(id) ON DELETE RESTRICT,
  CONSTRAINT fk_admissions_admitted_by FOREIGN KEY (admitted_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Consent forms (per admission) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS consent_forms (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  admission_id  BIGINT UNSIGNED NOT NULL,
  form_type     VARCHAR(100) NOT NULL,
  signed_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  file_url      VARCHAR(500) NULL,
  recorded_by   BIGINT UNSIGNED NULL,
  KEY idx_consent_forms_tenant (tenant_id),
  KEY idx_consent_forms_admission (admission_id),
  CONSTRAINT fk_consent_forms_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_forms_admission FOREIGN KEY (admission_id)
    REFERENCES admissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_forms_recorded_by FOREIGN KEY (recorded_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Nursing notes (per admission, flexible vitals) ───────────────────
CREATE TABLE IF NOT EXISTS nursing_notes (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id       BIGINT UNSIGNED NOT NULL,
  admission_id    BIGINT UNSIGNED NOT NULL,
  author_user_id  BIGINT UNSIGNED NOT NULL,
  note            VARCHAR(4000) NULL,
  vitals          JSON NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_nursing_notes_tenant (tenant_id),
  KEY idx_nursing_notes_admission (admission_id),
  CONSTRAINT fk_nursing_notes_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_nursing_notes_admission FOREIGN KEY (admission_id)
    REFERENCES admissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_nursing_notes_author FOREIGN KEY (author_user_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
