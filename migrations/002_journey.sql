-- 002_journey.sql — patient journey (Registration + OPD/Doctor + Lab/Pharmacy
-- routing) and the customizable-forms substrate. Layered on top of 001.
--
-- Applied to LOCAL DEV ONLY by the build process. The project owner applies
-- this to production manually (see CLAUDE.md "Production database rule").

-- ── Schema corrections from the role-hierarchy spec ──────────────────
-- SUPER_ADMIN is not tied to a hospital.
ALTER TABLE users
  MODIFY hospital_id BIGINT UNSIGNED NULL;

-- Front-desk role.
ALTER TABLE users
  MODIFY role ENUM(
    'SUPER_ADMIN','HOSPITAL_ADMIN','DOCTOR','PHARMACIST',
    'LAB_TECH','BILLING_STAFF','RECEPTIONIST'
  ) NOT NULL;

-- ── Customizable forms ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_templates (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id BIGINT UNSIGNED NOT NULL,
  form_type   ENUM('PATIENT_REGISTRATION','CONSULTATION','LAB_ORDER','BILLING') NOT NULL,
  fields      JSON NOT NULL,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_form_templates_hospital_type (hospital_id, form_type),
  KEY idx_form_templates_hospital (hospital_id),
  CONSTRAINT fk_form_templates_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Owner-added fields live here; core fields stay as typed columns.
ALTER TABLE patients      ADD COLUMN custom_fields JSON NULL AFTER phone;
ALTER TABLE consultations ADD COLUMN custom_fields JSON NULL AFTER diagnosis;

-- ── Visits (the queue entry / visit record) ─────────────────────────
CREATE TABLE IF NOT EXISTS visits (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id    BIGINT UNSIGNED NOT NULL,
  patient_id     BIGINT UNSIGNED NOT NULL,
  status         ENUM('REGISTERED','WITH_DOCTOR','PHARMACY','LAB','BILLING','DISCHARGED','CANCELLED')
                   NOT NULL DEFAULT 'REGISTERED',
  reason         VARCHAR(500) NULL,
  custom_fields  JSON NULL,
  registered_by  BIGINT UNSIGNED NULL,
  follow_up_date DATE NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  discharged_at  DATETIME(3) NULL,
  KEY idx_visits_hospital (hospital_id),
  KEY idx_visits_hospital_status (hospital_id, status),
  KEY idx_visits_patient (patient_id),
  KEY idx_visits_hospital_created (hospital_id, created_at),
  CONSTRAINT fk_visits_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_visits_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_visits_registered_by FOREIGN KEY (registered_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Consultation: link to visit, carry a fee ────────────────────────
ALTER TABLE consultations
  ADD COLUMN visit_id BIGINT UNSIGNED NULL AFTER hospital_id,
  ADD COLUMN fee DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER diagnosis,
  ADD KEY idx_consultations_visit (visit_id),
  ADD CONSTRAINT fk_consultations_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE SET NULL;

-- ── Prescriptions: header + items (replaces the flat 001 table) ─────
DROP TABLE IF EXISTS prescriptions;

CREATE TABLE prescriptions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id     BIGINT UNSIGNED NOT NULL,
  visit_id        BIGINT UNSIGNED NULL,
  consultation_id BIGINT UNSIGNED NOT NULL,
  status          ENUM('PENDING','PARTIALLY_FULFILLED','FULFILLED','NOT_REQUIRED','CANCELLED')
                    NOT NULL DEFAULT 'PENDING',
  notes           VARCHAR(500) NULL,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  fulfilled_by    BIGINT UNSIGNED NULL,
  fulfilled_at    DATETIME(3) NULL,
  KEY idx_prescriptions_hospital (hospital_id),
  KEY idx_prescriptions_hospital_status (hospital_id, status),
  KEY idx_prescriptions_consultation (consultation_id),
  KEY idx_prescriptions_visit (visit_id),
  CONSTRAINT fk_prescriptions_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_prescriptions_consultation FOREIGN KEY (consultation_id)
    REFERENCES consultations(id) ON DELETE CASCADE,
  CONSTRAINT fk_prescriptions_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prescription_items (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id        BIGINT UNSIGNED NOT NULL,
  prescription_id    BIGINT UNSIGNED NOT NULL,
  medicine_name      VARCHAR(191) NOT NULL,
  dosage             VARCHAR(191) NULL,
  quantity           INT UNSIGNED NOT NULL DEFAULT 1,
  dispensed_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  batch_number       VARCHAR(191) NULL,
  status             ENUM('PENDING','DISPENSED','OUT_OF_STOCK') NOT NULL DEFAULT 'PENDING',
  KEY idx_presc_items_hospital (hospital_id),
  KEY idx_presc_items_prescription (prescription_id),
  CONSTRAINT fk_presc_items_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_presc_items_prescription FOREIGN KEY (prescription_id)
    REFERENCES prescriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Lab orders ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id     BIGINT UNSIGNED NOT NULL,
  visit_id        BIGINT UNSIGNED NULL,
  consultation_id BIGINT UNSIGNED NOT NULL,
  patient_id      BIGINT UNSIGNED NOT NULL,
  tests           JSON NOT NULL,
  custom_fields   JSON NULL,
  status          ENUM('ORDERED','IN_PROGRESS','RESULTED','CANCELLED','NOT_REQUIRED')
                    NOT NULL DEFAULT 'ORDERED',
  results         JSON NULL,
  ordered_by      BIGINT UNSIGNED NULL,
  resulted_by     BIGINT UNSIGNED NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resulted_at     DATETIME(3) NULL,
  KEY idx_lab_orders_hospital (hospital_id),
  KEY idx_lab_orders_hospital_status (hospital_id, status),
  KEY idx_lab_orders_consultation (consultation_id),
  KEY idx_lab_orders_visit (visit_id),
  KEY idx_lab_orders_patient (patient_id),
  CONSTRAINT fk_lab_orders_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_orders_consultation FOREIGN KEY (consultation_id)
    REFERENCES consultations(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_orders_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_orders_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Follow-ups ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_ups (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id    BIGINT UNSIGNED NOT NULL,
  patient_id     BIGINT UNSIGNED NOT NULL,
  visit_id       BIGINT UNSIGNED NULL,
  scheduled_date DATE NOT NULL,
  reason         VARCHAR(500) NULL,
  status         ENUM('SCHEDULED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_follow_ups_hospital (hospital_id),
  KEY idx_follow_ups_hospital_date (hospital_id, scheduled_date),
  KEY idx_follow_ups_patient (patient_id),
  CONSTRAINT fk_follow_ups_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_ups_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_ups_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
