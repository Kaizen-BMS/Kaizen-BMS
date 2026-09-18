-- 031_workflows.sql — Phase 9: Workflow Automation (CLAUDE.md "Workflow
-- Automation"). A lightweight orchestration layer that tracks real
-- multi-module business processes (OPD prescription -> Pharmacy ->
-- Billing, Lab order -> Result -> Billing, IPD admission -> discharge) as
-- they progress through EXISTING domain routes/events — this does not
-- perform any business action itself (dispensing/billing/discharge all
-- stay exactly where they already are), it only observes and records.
--
-- Workflow DEFINITIONS (which steps a workflow type has, in what order)
-- are deliberately NOT a database table — they are a small, code-defined
-- catalog (src/lib/workflows/definitions.js), the exact same "catalog is
-- code, only instance/progress data is a row" split moduleRegistry.js /
-- dataContracts.js already established, and it also rules out "arbitrary
-- user-written executable code" by construction. Only two tables are
-- genuinely needed: one row per running/finished workflow, and one row
-- per step of that workflow's progress.

CREATE TABLE IF NOT EXISTS workflow_instances (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id           BIGINT UNSIGNED NOT NULL,
  -- Code-defined catalog key into src/lib/workflows/definitions.js —
  -- e.g. "OPD_PHARMACY_BILLING". Same pattern as
  -- module_connections.connection_type referencing dataContracts.js.
  definition_code     VARCHAR(64) NOT NULL,
  definition_version  INT UNSIGNED NOT NULL DEFAULT 1,
  -- What real domain row this workflow instance is tracking, e.g.
  -- ('prescription', 123) or ('admission', 45). The UNIQUE key below is
  -- the actual idempotency guarantee against a duplicate/redelivered
  -- trigger creating a second instance for the same real-world event —
  -- same "unique constraint over pre-check" discipline as
  -- uq_tariffs_open_slot / uq_appointments_doctor_active_slot elsewhere
  -- in this project.
  reference_type      VARCHAR(50) NOT NULL,
  reference_id        BIGINT UNSIGNED NOT NULL,
  status              ENUM('PENDING','RUNNING','WAITING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  current_step        VARCHAR(64) NULL,
  last_error          VARCHAR(500) NULL,
  started_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at        DATETIME(3) NULL,
  failed_at           DATETIME(3) NULL,
  created_by          BIGINT UNSIGNED NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_workflow_instances_reference (tenant_id, definition_code, reference_type, reference_id),
  KEY idx_workflow_instances_tenant (tenant_id),
  KEY idx_workflow_instances_tenant_status (tenant_id, status),
  CONSTRAINT fk_workflow_instances_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_instances_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per step of a definition's checklist, created up front (all
-- PENDING) the moment an instance starts, so the UI always has the full
-- checklist to render, not just whichever steps have run so far. This
-- table doubles as the auditable step-by-step history (attempts /
-- last_error / started_at / completed_at) — the same "the log IS the
-- audit trail" principle already used for module_connection_events /
-- bed_transfers / pharmacy_stock_movements, applied per-step instead of a
-- separate append-only events table (deliberately not built — see
-- CLAUDE.md's own Phase 9 writeup for why one more table wasn't needed).
CREATE TABLE IF NOT EXISTS workflow_instance_steps (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id             BIGINT UNSIGNED NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  step_code             VARCHAR(64) NOT NULL,
  step_order            INT UNSIGNED NOT NULL,
  status                ENUM('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  attempts              INT UNSIGNED NOT NULL DEFAULT 0,
  last_error            VARCHAR(500) NULL,
  next_attempt_at       DATETIME(3) NULL,
  -- Small, non-sensitive summary only (e.g. {"dispensedItems":2}) — never
  -- a full domain payload (CLAUDE.md Phase 9 "AUDIT" — do not log
  -- sensitive payloads).
  detail                JSON NULL,
  started_at            DATETIME(3) NULL,
  completed_at          DATETIME(3) NULL,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_workflow_instance_steps_step (workflow_instance_id, step_code),
  KEY idx_workflow_instance_steps_tenant (tenant_id),
  KEY idx_workflow_instance_steps_instance (workflow_instance_id),
  CONSTRAINT fk_workflow_instance_steps_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_instance_steps_instance FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
