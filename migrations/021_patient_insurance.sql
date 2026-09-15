-- Insurance details + payment category, captured at patient registration.
-- One row per patient (attached per-PATIENT, not per-visit — same choice
-- already made for referral_sources: a patient's insurance doesn't usually
-- change across follow-up visits, and front desk can edit it later without
-- re-registering). No file/blob storage exists in this project (see
-- Attendance's proxy check-in photo) so the insurance card upload is a
-- client-compressed JPEG data URL, same as everywhere else in this app.
CREATE TABLE IF NOT EXISTS patient_insurance (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id                 BIGINT UNSIGNED NOT NULL,
  patient_id                BIGINT UNSIGNED NOT NULL,

  -- Payment Category — always set (defaults to SELF_PAY, the common
  -- walk-in case). payment_reference_number is the one generic "store the
  -- number of that thing" slot the spec asked for: the Ayushman Bharat/
  -- PM-JAY card number, a corporate employee ID, a government scheme
  -- reference number, etc. — whichever is relevant for the chosen
  -- category. For the INSURANCE category the policy_number below already
  -- serves that role, so payment_reference_number is typically left blank
  -- there rather than duplicating it.
  payment_category          ENUM('SELF_PAY','INSURANCE','CORPORATE','GOVERNMENT_SCHEME','AYUSHMAN_BHARAT','OTHER')
                             NOT NULL DEFAULT 'SELF_PAY',
  payment_reference_number  VARCHAR(120) NULL,

  -- Insurance Details block — only meaningful when insurance_available.
  insurance_available       TINYINT(1) NOT NULL DEFAULT 0,
  insurance_company         VARCHAR(191) NULL,
  policy_number              VARCHAR(120) NULL,
  member_id                 VARCHAR(120) NULL,
  tpa                       VARCHAR(191) NULL,
  valid_from                DATE NULL,
  valid_until               DATE NULL,
  insurance_card_upload     MEDIUMTEXT NULL,
  pre_auth_required         TINYINT(1) NOT NULL DEFAULT 0,

  updated_by                BIGINT UNSIGNED NULL,
  created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_insurance_patient (patient_id),
  KEY idx_patient_insurance_tenant (tenant_id),
  CONSTRAINT fk_patient_insurance_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_patient_insurance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_patient_insurance_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
