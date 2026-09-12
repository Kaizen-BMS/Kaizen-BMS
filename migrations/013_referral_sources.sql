-- 013_referral_sources.sql — patient referral tracking (RMP/local doctors,
-- health camps, insurance companies, health-card schemes). Data capture +
-- reporting only for this step — no billing/commission integration.
--
-- Same "the system builds itself" philosophy as form_templates: the list of
-- referral sources is tenant-managed data (an admin screen, `referral:manage`),
-- never a hardcoded enum of specific doctors/camps/insurers — only the
-- CATEGORY (`type`) is fixed, since that's what's actually structural.
-- Attached per-PATIENT (set once, editable), not per-visit — owner's
-- explicit choice.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

CREATE TABLE IF NOT EXISTS referral_sources (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(191) NOT NULL,
  type           ENUM('RMP', 'LOCAL_DOCTOR', 'CAMP', 'INSURANCE', 'HEALTH_CARD', 'OTHER') NOT NULL,
  contact_phone  VARCHAR(64) NULL,
  notes          VARCHAR(500) NULL,
  active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_referral_sources_tenant (tenant_id),
  KEY idx_referral_sources_tenant_active (tenant_id, active),
  CONSTRAINT fk_referral_sources_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE patients
  ADD COLUMN referral_source_id BIGINT UNSIGNED NULL AFTER abha_id,
  ADD KEY idx_patients_referral_source (referral_source_id),
  ADD CONSTRAINT fk_patients_referral_source FOREIGN KEY (referral_source_id)
    REFERENCES referral_sources(id) ON DELETE SET NULL;
