-- 010_billing_fixup.sql — corrects 009_billing.sql: `bills` and `bill_items`
-- already existed as a minimal placeholder scaffold from 001_init.sql
-- (hospital_id, no visit_id/bill_type/created_by/finalized_at, a different
-- status enum) — `CREATE TABLE IF NOT EXISTS` in 009 silently no-op'd on
-- both, so the real Billing module schema never landed on them. Both tables
-- are confirmed empty (0 rows) — this is a structural fix, not a data
-- migration. `discounts`/`payments`/`refunds` from 009 were genuinely new
-- and are untouched here.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

ALTER TABLE bills
  MODIFY status ENUM('OPEN', 'PAID', 'PARTIALLY_PAID', 'REFUNDED') NOT NULL DEFAULT 'OPEN',
  ADD COLUMN visit_id BIGINT UNSIGNED NULL AFTER patient_id,
  ADD COLUMN bill_type ENUM('OPD', 'IPD') NOT NULL DEFAULT 'OPD' AFTER visit_id,
  ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER status,
  ADD COLUMN finalized_at DATETIME(3) NULL AFTER created_at,
  ADD KEY idx_bills_tenant_status (tenant_id, status),
  ADD KEY idx_bills_visit (visit_id),
  ADD CONSTRAINT fk_bills_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_bills_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL;

-- bill_type had to carry a DEFAULT to satisfy the ALTER on principle, but
-- there are no existing rows for it to matter — drop the default going
-- forward so every future insert names it explicitly.
ALTER TABLE bills
  MODIFY bill_type ENUM('OPD', 'IPD') NOT NULL;

ALTER TABLE bill_items
  ADD COLUMN source ENUM('CONSULTATION', 'PHARMACY', 'LAB', 'IPD_ROOM')
    NOT NULL DEFAULT 'CONSULTATION' AFTER bill_id,
  ADD COLUMN reference_type VARCHAR(50) NULL AFTER amount,
  ADD COLUMN reference_id BIGINT UNSIGNED NULL AFTER reference_type,
  ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER reference_id,
  ADD KEY idx_bill_items_reference (reference_type, reference_id);

ALTER TABLE bill_items
  MODIFY source ENUM('CONSULTATION', 'PHARMACY', 'LAB', 'IPD_ROOM') NOT NULL;
