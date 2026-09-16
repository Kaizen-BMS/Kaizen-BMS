-- 027_pricing_tariff.sql — Phase 6: Service Master + Tariff Master + a
-- GST-shaped tax foundation, consumed by the existing Billing system.
-- Additive only; nothing existing is renamed or restructured.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

-- Service Master — a reusable, tenant-owned catalog of billable services.
-- Same "code is tenant data, category is code-defined" split already used
-- by referral_sources/form_templates: `service_type` is a fixed, code-known
-- ENUM; the actual catalog of named services is entirely tenant data.
CREATE TABLE IF NOT EXISTS services (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  code         VARCHAR(50) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  description  VARCHAR(500) NULL,
  category     VARCHAR(100) NULL,
  service_type ENUM('OPD', 'CONSULTATION', 'PROCEDURE', 'IPD', 'ROOM', 'LAB',
                     'RADIOLOGY', 'EMERGENCY', 'PHARMACY', 'OTHER') NOT NULL,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  created_by   BIGINT UNSIGNED NULL,
  updated_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_services_tenant_code (tenant_id, code),
  KEY idx_services_tenant (tenant_id),
  KEY idx_services_tenant_type_active (tenant_id, service_type, active),
  CONSTRAINT fk_services_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_services_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_services_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tariff Master — versioned pricing for a service. A tariff is never
-- edited in place once bills may reference it; changing a price CLOSES the
-- current tariff (sets effective_to) and INSERTs a new one (see
-- src/lib/pricing.js's changeTariff()). Historical bills snapshot their own
-- price onto bill_items (below), so they never move when a tariff changes.
--
-- `patient_category` deliberately reuses patient_insurance's own
-- payment_category vocabulary (SELF_PAY/INSURANCE/CORPORATE/
-- GOVERNMENT_SCHEME/AYUSHMAN_BHARAT/OTHER) instead of inventing a parallel
-- GENERAL/CORPORATE/... set — same category concept already exists in this
-- product, reused rather than duplicated (CLAUDE.md "Insurance / payment").
--
-- Overlap prevention follows this project's own established NULL-≠-NULL
-- generated-column trick (module_instances.default_slot,
-- appointments.active_slot_time, visits.visit_date): `open_slot` is 1 only
-- for a tariff that is both active AND still open-ended
-- (effective_to IS NULL) — MariaDB unique indexes never treat two NULLs as
-- duplicates, so at most one "current" tariff can exist per
-- (tenant, service, patient_category) at the database level, not just by
-- application discipline, while every closed/historical tariff (effective_to
-- set) coexists freely.
CREATE TABLE IF NOT EXISTS tariffs (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id        BIGINT UNSIGNED NOT NULL,
  service_id       BIGINT UNSIGNED NOT NULL,
  patient_category ENUM('SELF_PAY', 'INSURANCE', 'CORPORATE', 'GOVERNMENT_SCHEME',
                         'AYUSHMAN_BHARAT', 'OTHER') NOT NULL DEFAULT 'SELF_PAY',
  context          VARCHAR(100) NULL,
  price            DECIMAL(12, 2) NOT NULL,
  tax_inclusive    TINYINT(1) NOT NULL DEFAULT 0,
  tax_category     VARCHAR(50) NULL,
  cgst_rate        DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  sgst_rate        DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  igst_rate        DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  effective_from   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  effective_to     DATETIME(3) NULL,
  active           TINYINT(1) NOT NULL DEFAULT 1,
  reason           VARCHAR(500) NULL,
  superseded_by_tariff_id BIGINT UNSIGNED NULL,
  open_slot        TINYINT GENERATED ALWAYS AS
                     (CASE WHEN active = 1 AND effective_to IS NULL THEN 1 ELSE NULL END) STORED,
  created_by       BIGINT UNSIGNED NULL,
  updated_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tariffs_open_slot (tenant_id, service_id, patient_category, open_slot),
  KEY idx_tariffs_tenant (tenant_id),
  KEY idx_tariffs_service_lookup (tenant_id, service_id, patient_category, active, effective_from),
  KEY idx_tariffs_superseded_by (superseded_by_tariff_id),
  CONSTRAINT chk_tariffs_price CHECK (price >= 0),
  CONSTRAINT chk_tariffs_rates CHECK (cgst_rate >= 0 AND sgst_rate >= 0 AND igst_rate >= 0),
  CONSTRAINT chk_tariffs_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT fk_tariffs_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tariffs_service FOREIGN KEY (service_id)
    REFERENCES services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tariffs_superseded_by FOREIGN KEY (superseded_by_tariff_id)
    REFERENCES tariffs(id) ON DELETE SET NULL,
  CONSTRAINT fk_tariffs_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tariffs_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Price snapshot on bill_items — the historical record of what a line item
-- actually charged, independent of any future tariff change (see
-- CLAUDE.md "Pricing / Tariff — price snapshot"). All nullable: existing
-- CONSULTATION/PHARMACY/LAB/IPD_ROOM items (created before this phase, and
-- any future ones not priced from a Service) simply don't carry these —
-- `amount` alone, already established, remains authoritative for them.
ALTER TABLE bill_items
  ADD COLUMN service_id      BIGINT UNSIGNED NULL AFTER reference_id,
  ADD COLUMN tariff_id       BIGINT UNSIGNED NULL AFTER service_id,
  ADD COLUMN quantity        DECIMAL(10, 2) NOT NULL DEFAULT 1.00 AFTER tariff_id,
  ADD COLUMN unit_price      DECIMAL(12, 2) NULL AFTER quantity,
  ADD COLUMN taxable_amount  DECIMAL(12, 2) NULL AFTER unit_price,
  ADD COLUMN tax_rate        DECIMAL(5, 2) NULL AFTER taxable_amount,
  ADD COLUMN cgst_amount     DECIMAL(12, 2) NULL AFTER tax_rate,
  ADD COLUMN sgst_amount     DECIMAL(12, 2) NULL AFTER cgst_amount,
  ADD COLUMN igst_amount     DECIMAL(12, 2) NULL AFTER sgst_amount,
  ADD COLUMN tax_amount      DECIMAL(12, 2) NULL AFTER igst_amount,
  ADD KEY idx_bill_items_service (service_id),
  ADD KEY idx_bill_items_tariff (tariff_id),
  ADD CONSTRAINT fk_bill_items_service FOREIGN KEY (service_id)
    REFERENCES services(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_bill_items_tariff FOREIGN KEY (tariff_id)
    REFERENCES tariffs(id) ON DELETE SET NULL;

-- A priced, tariff-sourced line item — distinct from the existing
-- auto-added CONSULTATION/PHARMACY/LAB/IPD_ROOM sources. Same
-- ENUM-extension pattern already used repeatedly in this project
-- (tenant_modules.module_name in 004/016, bill_items_source itself already
-- extended once in 010).
ALTER TABLE bill_items
  MODIFY source ENUM('CONSULTATION', 'PHARMACY', 'LAB', 'IPD_ROOM', 'SERVICE') NOT NULL;
