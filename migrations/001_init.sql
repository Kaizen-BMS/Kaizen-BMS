-- Kaizen HMS — initial schema. All hospital-scoped tables carry hospital_id
-- + an index on it; every FK is explicit; InnoDB + utf8mb4 throughout.

CREATE TABLE IF NOT EXISTS hospitals (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(191) NOT NULL,
  slug        VARCHAR(191) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_hospitals_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hospital_modules (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id  BIGINT UNSIGNED NOT NULL,
  module_name  ENUM('PHARMACY','DOCTOR_OPD','LAB','BILLING') NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_hospital_module (hospital_id, module_name),
  KEY idx_hospital_modules_hospital (hospital_id),
  CONSTRAINT fk_hospital_modules_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id    BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(191) NOT NULL,
  email          VARCHAR(191) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('SUPER_ADMIN','HOSPITAL_ADMIN','DOCTOR','PHARMACIST','LAB_TECH','BILLING_STAFF') NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_hospital_email (hospital_id, email),
  KEY idx_users_hospital (hospital_id),
  CONSTRAINT fk_users_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patients (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id  BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(191) NOT NULL,
  age          SMALLINT UNSIGNED NULL,
  phone        VARCHAR(32) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_patients_hospital (hospital_id),
  KEY idx_patients_hospital_created (hospital_id, created_at),
  CONSTRAINT fk_patients_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consultations (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id  BIGINT UNSIGNED NOT NULL,
  patient_id   BIGINT UNSIGNED NOT NULL,
  doctor_id    BIGINT UNSIGNED NOT NULL,
  notes        TEXT NULL,
  diagnosis    VARCHAR(500) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_consultations_hospital (hospital_id),
  KEY idx_consultations_patient (patient_id),
  KEY idx_consultations_doctor (doctor_id),
  CONSTRAINT fk_consultations_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultations_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultations_doctor FOREIGN KEY (doctor_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prescriptions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id      BIGINT UNSIGNED NOT NULL,
  consultation_id  BIGINT UNSIGNED NOT NULL,
  medicine_name    VARCHAR(191) NOT NULL,
  dosage           VARCHAR(191) NULL,
  quantity         INT UNSIGNED NOT NULL DEFAULT 1,
  KEY idx_prescriptions_hospital (hospital_id),
  KEY idx_prescriptions_consultation (consultation_id),
  CONSTRAINT fk_prescriptions_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_prescriptions_consultation FOREIGN KEY (consultation_id)
    REFERENCES consultations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pharmacy_stock (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id   BIGINT UNSIGNED NOT NULL,
  medicine_name VARCHAR(191) NOT NULL,
  batch_number  VARCHAR(191) NULL,
  expiry_date   DATE NULL,
  quantity      INT NOT NULL DEFAULT 0,
  KEY idx_stock_hospital (hospital_id),
  KEY idx_stock_hospital_medicine (hospital_id, medicine_name),
  CONSTRAINT fk_stock_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bills (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hospital_id   BIGINT UNSIGNED NOT NULL,
  patient_id    BIGINT UNSIGNED NOT NULL,
  total_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  status        ENUM('DRAFT','UNPAID','PAID','CANCELLED') NOT NULL DEFAULT 'UNPAID',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_bills_hospital (hospital_id),
  KEY idx_bills_patient (patient_id),
  CONSTRAINT fk_bills_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_bills_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bill_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bill_id      BIGINT UNSIGNED NOT NULL,
  description  VARCHAR(500) NOT NULL,
  amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
  KEY idx_bill_items_bill (bill_id),
  CONSTRAINT fk_bill_items_bill FOREIGN KEY (bill_id)
    REFERENCES bills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
