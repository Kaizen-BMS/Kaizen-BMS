-- Phase 2 of the platform rebuild (see CLAUDE.md "Platform rebuild — Phase
-- 1 architecture sign-off"): separates MODULE DEFINITION (still
-- moduleRegistry.js's static catalog, unchanged) from MODULE INSTANCE (a
-- named, independently-lifecycled installed copy of a module — "Main
-- Pharmacy" vs "Emergency Pharmacy" for the same PHARMACY definition).
--
-- Deliberately ADDITIVE, not a replacement for tenant_modules:
-- tenant_modules stays the single source of truth for "is module X
-- rented/active for this tenant" — every existing RBAC/module-gate/
-- socket-room call site (src/lib/modules.js) keeps reading it, completely
-- unchanged, so nothing existing can regress. module_instances sits
-- UNDER an active module, answering a question tenant_modules was never
-- designed to answer: which named operational copies of it exist. A
-- tenant with exactly one instance (every tenant today) behaves
-- identically to before this migration.
CREATE TABLE IF NOT EXISTS module_instances (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  module_name    ENUM('PHARMACY','DOCTOR_OPD','LAB','BILLING','IPD','APPOINTMENTS') NOT NULL,
  name           VARCHAR(191) NOT NULL,
  status         ENUM('ACTIVE','SUSPENDED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  -- The instance every existing route implicitly means when it doesn't
  -- (yet) ask which instance to use — see resolveInstance() in
  -- src/lib/moduleInstances.js. Exactly one default per (tenant, module).
  is_default     TINYINT(1) NOT NULL DEFAULT 0,
  configuration  JSON NULL,
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_module_instances_tenant_module_name (tenant_id, module_name, name),
  KEY idx_module_instances_tenant (tenant_id),
  KEY idx_module_instances_tenant_module (tenant_id, module_name),
  CONSTRAINT fk_module_instances_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_module_instances_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A real, enforced invariant (not just an app-level convention): at most
-- one default instance per (tenant, module). MySQL/MariaDB unique indexes
-- never treat two NULLs as duplicates, so a NULL "tie-breaker" column only
-- constrained WHEN is_default=1 is expressed the same way
-- appointments.active_slot_time already does — a generated column that's
-- NULL unless is_default is true.
ALTER TABLE module_instances
  ADD COLUMN default_slot TINYINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN 1 ELSE NULL END) STORED,
  ADD UNIQUE KEY uq_module_instances_tenant_module_default (tenant_id, module_name, default_slot);

-- Backfill: every tenant that has ever rented a module (tenant_modules has
-- a row for it at all, active or currently suspended) gets exactly one
-- default instance, named after the module's registry label, carrying the
-- module's current is_active state as its own status. This is what makes
-- "existing users don't have to manually recreate their modules" true —
-- the migration does it for them, once, automatically.
INSERT INTO module_instances (tenant_id, module_name, name, status, is_default, created_at)
SELECT
  tm.tenant_id,
  tm.module_name,
  CASE tm.module_name
    WHEN 'PHARMACY'     THEN 'Pharmacy'
    WHEN 'DOCTOR_OPD'   THEN 'Doctor / OPD'
    WHEN 'LAB'          THEN 'Lab'
    WHEN 'BILLING'      THEN 'Billing'
    WHEN 'IPD'          THEN 'IPD / Beds'
    WHEN 'APPOINTMENTS' THEN 'Appointments'
  END,
  CASE WHEN tm.is_active = 1 THEN 'ACTIVE' ELSE 'SUSPENDED' END,
  1,
  NOW()
FROM tenant_modules tm
WHERE NOT EXISTS (
  SELECT 1 FROM module_instances mi
  WHERE mi.tenant_id = tm.tenant_id AND mi.module_name = tm.module_name
);
