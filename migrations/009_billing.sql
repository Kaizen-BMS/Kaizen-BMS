-- 009_billing.sql — Billing module (build order step 7): bills, line items,
-- payments, discounts, refunds. Two genuinely different flows share this
-- one schema: OPD (bill created once at checkout) and IPD (a running bill
-- that accumulates items throughout an admission, finalized at discharge —
-- see src/lib/billingEvents.js). Layered on top of 001-008.
--
-- This migration is applied via the new automatic backup-then-apply flow
-- (npm run db:migrate — see scripts/dbApplyGuard.js and CLAUDE.md "Database
-- rule", updated 2026-09-11) — NOT handed off for manual apply.

CREATE TABLE IF NOT EXISTS bills (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  patient_id     BIGINT UNSIGNED NOT NULL,
  visit_id       BIGINT UNSIGNED NULL,
  bill_type      ENUM('OPD', 'IPD') NOT NULL,
  status         ENUM('OPEN', 'PAID', 'PARTIALLY_PAID', 'REFUNDED') NOT NULL DEFAULT 'OPEN',
  total_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finalized_at   DATETIME(3) NULL,
  KEY idx_bills_tenant (tenant_id),
  KEY idx_bills_tenant_status (tenant_id, status),
  KEY idx_bills_patient (patient_id),
  KEY idx_bills_visit (visit_id),
  CONSTRAINT fk_bills_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_bills_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bills_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE SET NULL,
  CONSTRAINT fk_bills_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No tenant_id here on purpose — scoped transitively through bills, same
-- pattern already documented in CLAUDE.md "Prisma" for TENANT_SCOPED_MODELS.
-- `reference_type`/`reference_id` optionally point back at the source row
-- (prescription_items.id, lab_orders.id, consultations.id) so the IPD
-- event-driven accrual can be idempotent — never append the same dispensed
-- item / resulted test to a bill twice even if an event were ever re-fired.
CREATE TABLE IF NOT EXISTS bill_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bill_id        BIGINT UNSIGNED NOT NULL,
  source         ENUM('CONSULTATION', 'PHARMACY', 'LAB', 'IPD_ROOM') NOT NULL,
  description    VARCHAR(255) NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id   BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_bill_items_bill (bill_id),
  KEY idx_bill_items_reference (reference_type, reference_id),
  CONSTRAINT fk_bill_items_bill FOREIGN KEY (bill_id)
    REFERENCES bills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bill_id       BIGINT UNSIGNED NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  mode          ENUM('CASH', 'CARD', 'UPI') NOT NULL,
  recorded_by   BIGINT UNSIGNED NULL,
  paid_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_payments_bill (bill_id),
  CONSTRAINT fk_payments_bill FOREIGN KEY (bill_id)
    REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Always requires a reason + a named approver — audit-relevant, never an
-- anonymous discount. Not a mutation of bill_items.amount; the discount is
-- its own row, subtracted when computing what's owed.
CREATE TABLE IF NOT EXISTS discounts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bill_id        BIGINT UNSIGNED NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  reason         VARCHAR(500) NOT NULL,
  authorized_by  BIGINT UNSIGNED NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_discounts_bill (bill_id),
  CONSTRAINT fk_discounts_bill FOREIGN KEY (bill_id)
    REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_discounts_authorized_by FOREIGN KEY (authorized_by)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Its own recorded action — never a silent negative Payment row. Optionally
-- tied to the specific payment it refunds (nullable: a refund against the
-- bill as a whole is also valid).
CREATE TABLE IF NOT EXISTS refunds (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bill_id        BIGINT UNSIGNED NOT NULL,
  payment_id     BIGINT UNSIGNED NULL,
  amount         DECIMAL(10,2) NOT NULL,
  reason         VARCHAR(500) NOT NULL,
  authorized_by  BIGINT UNSIGNED NOT NULL,
  refunded_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_refunds_bill (bill_id),
  CONSTRAINT fk_refunds_bill FOREIGN KEY (bill_id)
    REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id)
    REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT fk_refunds_authorized_by FOREIGN KEY (authorized_by)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IPD room charges need a rate to bill against — nothing in the schema had
-- one. Per-bed (not per-ward-type-table) keeps it simple: each bed carries
-- its own daily rate, editable like bed_number/ward_type already are.
ALTER TABLE beds
  ADD COLUMN daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER bed_number;
