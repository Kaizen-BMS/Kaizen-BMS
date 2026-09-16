-- 030_departments.sql — Phase 8B: Department Master, the one genuinely
-- missing master-data entity (CLAUDE.md "Master data + data contract
-- foundation"). Every other master-data concept this phase audited
-- already has a real, working model (patients, users/staff_profiles,
-- services, and — since Phase 7 — services rows of type PHARMACY/LAB
-- already serve as the medicine/lab-test identity via
-- prescription_items.service_id / lab_order_items.service_id) — none of
-- those are duplicated here.
--
-- Deliberately NOT wired into any other table yet (no department_id added
-- to services/staff_profiles/beds this phase) — that would be scope creep
-- beyond "establish the master data table," per this phase's own "do not
-- multiply database entities" instruction. A future phase can add an
-- optional department_id FK to whichever table actually needs it once a
-- real cross-cutting requirement exists.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

CREATE TABLE IF NOT EXISTS departments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id  BIGINT UNSIGNED NOT NULL,
  code       VARCHAR(50) NOT NULL,
  name       VARCHAR(191) NOT NULL,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_departments_tenant_code (tenant_id, code),
  KEY idx_departments_tenant (tenant_id),
  KEY idx_departments_tenant_active (tenant_id, active),
  CONSTRAINT fk_departments_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_departments_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_departments_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
