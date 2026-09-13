-- 015_bed_management.sql — completes the bed-management feature set beyond
-- admit/discharge: ward/bed transfer (a real, common event — a patient moved
-- from ICU to a general ward as they recover) and bed maintenance with a
-- reason + optional expected-return date. Occupancy/length-of-stay
-- reporting (see /api/ipd/reports/occupancy) needs no new schema — it reads
-- the existing beds/admissions tables.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

-- Transfer log — an admission's bed_id moves to the new bed (so "current
-- bed" queries stay a simple lookup); this table is the audit trail of how
-- it got there. The old bed goes CLEANING, the new bed goes OCCUPIED, same
-- housekeeping-before-reuse rule as a normal discharge.
CREATE TABLE IF NOT EXISTS bed_transfers (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id       BIGINT UNSIGNED NOT NULL,
  admission_id    BIGINT UNSIGNED NOT NULL,
  from_bed_id     BIGINT UNSIGNED NOT NULL,
  to_bed_id       BIGINT UNSIGNED NOT NULL,
  reason          VARCHAR(255) NOT NULL,
  transferred_by  BIGINT UNSIGNED NOT NULL,
  transferred_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_bed_transfers_tenant (tenant_id),
  KEY idx_bed_transfers_admission (admission_id),
  CONSTRAINT fk_bed_transfers_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_bed_transfers_admission FOREIGN KEY (admission_id)
    REFERENCES admissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_bed_transfers_from_bed FOREIGN KEY (from_bed_id)
    REFERENCES beds(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bed_transfers_to_bed FOREIGN KEY (to_bed_id)
    REFERENCES beds(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bed_transfers_by FOREIGN KEY (transferred_by)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `MAINTENANCE` was already a valid beds.status value (004_ipd.sql) but
-- carried no reason/return-date — a bed could be pulled from the pool with
-- no record of why. Cleared back to NULL whenever status moves off
-- MAINTENANCE (enforced in the API, not here).
ALTER TABLE beds
  ADD COLUMN maintenance_reason VARCHAR(255) NULL AFTER status,
  ADD COLUMN maintenance_until DATE NULL AFTER maintenance_reason;
