-- 033_external_integration_analytics.sql — External Integration Foundation
-- + External Lab/Pharmacy tracking + Analytics rollups, in one migration
-- (all additive, no existing table altered). See docs delivered earlier
-- (External Integration Blueprint) for the full reasoning; this is the
-- minimal schema that supports it.
--
-- Deliberate design choices, so the next reader doesn't re-litigate them:
--  - External connections get their OWN small lifecycle table
--    (external_connections/external_connection_events), mirroring
--    module_connections' exact status enum and event-log pattern rather
--    than forcing an external provider into module_instances' shape (a
--    provider is not "an installed copy of a Kaizen module").
--  - Provider health is columns on external_providers, not a separate
--    table — health is derived/observed state on the provider itself,
--    same "don't invent a table for something one row already owns"
--    discipline used throughout this schema.
--  - No separate integration_logs table — external_orders (outbound),
--    webhook_events (inbound), and external_connection_events (lifecycle)
--    already cover the real audit surface between them.
--  - Analytics uses exactly two rollup tables — one wide per-tenant-per-day
--    fact table, one narrow per-dimension table (doctor/medicine/ward/
--    provider) — instead of one table per metric domain, the standard
--    "wide fact + narrow dimension" shape for this scale, not a warehouse.

-- ── External Integration Foundation ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_providers (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  provider_type      VARCHAR(30) NOT NULL,      -- 'LAB' | 'PHARMACY' — VARCHAR not ENUM, same reasoning as module_connections.connection_type
  provider_code      VARCHAR(50) NOT NULL,      -- e.g. 'MOCK_LAB' — the adapter registry key
  name               VARCHAR(191) NOT NULL,
  base_url           VARCHAR(500) NULL,
  api_version        VARCHAR(20) NULL,
  environment        ENUM('SANDBOX','PRODUCTION') NOT NULL DEFAULT 'SANDBOX',
  active             TINYINT(1) NOT NULL DEFAULT 1,
  capabilities       JSON NULL,                 -- e.g. ["ORDER_CREATE","RESULT_WEBHOOK","CANCEL"]
  config             JSON NULL,                 -- non-secret metadata only — see external_credentials for secrets
  -- Health — observed, never hand-set to a "status" enum; derived at read time from these columns.
  last_success_at    DATETIME(3) NULL,
  last_failure_at    DATETIME(3) NULL,
  failure_count      INT UNSIGNED NOT NULL DEFAULT 0,
  last_error_category VARCHAR(50) NULL,
  last_latency_ms    INT UNSIGNED NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_external_providers_tenant_code (tenant_id, provider_code),
  KEY idx_external_providers_tenant (tenant_id),
  KEY idx_external_providers_tenant_type (tenant_id, provider_type),
  CONSTRAINT fk_external_providers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_external_providers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per provider (today) — secret is AES-256-GCM ciphertext, key
-- from process.env.EXTERNAL_INTEGRATION_KEY, never plaintext, never
-- returned by any API. Config (non-secret) stays on external_providers —
-- this table ONLY ever holds the secret material.
CREATE TABLE IF NOT EXISTS external_credentials (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  provider_id        BIGINT UNSIGNED NOT NULL,
  encrypted_secret   TEXT NOT NULL,             -- base64(ciphertext)
  iv                 VARCHAR(32) NOT NULL,       -- base64 initialization vector
  auth_tag           VARCHAR(32) NOT NULL,       -- base64 GCM auth tag
  key_version        INT UNSIGNED NOT NULL DEFAULT 1,
  rotated_at         DATETIME(3) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_external_credentials_provider (provider_id),
  KEY idx_external_credentials_tenant (tenant_id),
  CONSTRAINT fk_external_credentials_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_external_credentials_provider FOREIGN KEY (provider_id) REFERENCES external_providers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mirrors module_connections' exact lifecycle (PENDING→ACTIVE→PAUSED/
-- SUSPENDED→ACTIVE|REVOKED) for a module_instance <-> external_provider
-- pair instead of module_instance <-> module_instance.
CREATE TABLE IF NOT EXISTS external_connections (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  source_instance_id BIGINT UNSIGNED NOT NULL,   -- the Kaizen module_instances row initiating (e.g. DOCTOR_OPD)
  provider_id        BIGINT UNSIGNED NOT NULL,
  connection_type    VARCHAR(64) NOT NULL,       -- Data Contract key, e.g. 'EXTERNAL_LAB_ORDER'
  status             ENUM('PENDING','ACTIVE','PAUSED','SUSPENDED','REVOKED') NOT NULL DEFAULT 'PENDING',
  allowed_fields     JSON NULL,
  permissions        JSON NULL,
  created_by         BIGINT UNSIGNED NOT NULL,
  approved_by        BIGINT UNSIGNED NULL,
  approved_at        DATETIME(3) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_external_connections_pair_type (source_instance_id, provider_id, connection_type),
  KEY idx_external_connections_tenant (tenant_id),
  KEY idx_external_connections_provider (provider_id),
  CONSTRAINT fk_external_connections_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_external_connections_source FOREIGN KEY (source_instance_id) REFERENCES module_instances(id),
  CONSTRAINT fk_external_connections_provider FOREIGN KEY (provider_id) REFERENCES external_providers(id),
  CONSTRAINT fk_external_connections_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_external_connections_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only, same "the log IS the audit trail" shape as module_connection_events.
CREATE TABLE IF NOT EXISTS external_connection_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id  BIGINT UNSIGNED NOT NULL,
  from_status    ENUM('PENDING','ACTIVE','PAUSED','SUSPENDED','REVOKED') NULL,
  to_status      ENUM('PENDING','ACTIVE','PAUSED','SUSPENDED','REVOKED') NOT NULL,
  actor_user_id  BIGINT UNSIGNED NULL,
  note           VARCHAR(500) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_external_connection_events_connection (connection_id),
  CONSTRAINT fk_external_connection_events_connection FOREIGN KEY (connection_id) REFERENCES external_connections(id) ON DELETE CASCADE,
  CONSTRAINT fk_external_connection_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generic mapping: Kaizen entity <-> a specific provider's own id for that
-- same real-world thing. Never inferred — always written explicitly at
-- the moment a mapping is first established.
CREATE TABLE IF NOT EXISTS external_identifiers (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  provider_id    BIGINT UNSIGNED NOT NULL,
  entity_type    VARCHAR(30) NOT NULL,   -- 'PATIENT' | 'LAB_ORDER' | 'PRESCRIPTION_ITEM' | 'RADIOLOGY_ORDER'
  internal_id    BIGINT UNSIGNED NOT NULL,
  external_id    VARCHAR(191) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_external_identifiers_internal (tenant_id, provider_id, entity_type, internal_id),
  UNIQUE KEY uq_external_identifiers_external (tenant_id, provider_id, entity_type, external_id),
  KEY idx_external_identifiers_tenant (tenant_id),
  CONSTRAINT fk_external_identifiers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_external_identifiers_provider FOREIGN KEY (provider_id) REFERENCES external_providers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The OUTBOUND record: "this internal order was sent to this provider,
-- here's what happened." A real state machine (unlike the lighter
-- schedule/start/cancel-only shape of internal orders) because this one
-- genuinely needs to track network-call outcomes, not just business status.
CREATE TABLE IF NOT EXISTS external_orders (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id              BIGINT UNSIGNED NOT NULL,
  provider_id            BIGINT UNSIGNED NOT NULL,
  external_connection_id BIGINT UNSIGNED NOT NULL,
  order_type             VARCHAR(30) NOT NULL,   -- 'LAB_ORDER' | 'PHARMACY_PRESCRIPTION'
  internal_reference_type VARCHAR(50) NOT NULL,  -- 'lab_order' | 'prescription_item'
  internal_reference_id  BIGINT UNSIGNED NOT NULL,
  external_order_ref     VARCHAR(191) NULL,      -- the provider's own order id, once known
  status                 ENUM('PENDING','SENT','ACKNOWLEDGED','PROCESSING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  attempts               INT UNSIGNED NOT NULL DEFAULT 0,
  last_error             VARCHAR(500) NULL,
  request_payload        JSON NULL,   -- exactly what the Data Contract allowed — never a raw internal object
  response_payload       JSON NULL,   -- last response summary, never the full raw external payload if it could carry more than the contract allows
  sent_at                DATETIME(3) NULL,
  acknowledged_at        DATETIME(3) NULL,
  completed_at           DATETIME(3) NULL,
  cancelled_at           DATETIME(3) NULL,
  created_by             BIGINT UNSIGNED NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_external_orders_internal_ref (tenant_id, order_type, internal_reference_type, internal_reference_id),
  KEY idx_external_orders_tenant (tenant_id),
  KEY idx_external_orders_provider (provider_id),
  KEY idx_external_orders_connection (external_connection_id),
  CONSTRAINT fk_external_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_external_orders_provider FOREIGN KEY (provider_id) REFERENCES external_providers(id),
  CONSTRAINT fk_external_orders_connection FOREIGN KEY (external_connection_id) REFERENCES external_connections(id),
  CONSTRAINT fk_external_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The Inbox — the inbound mirror of outbox_events, same shape, opposite
-- direction. provider_event_id is the real idempotency guarantee: if a
-- provider redelivers the same webhook 10 times, only the first insert
-- ever succeeds — every duplicate hits this unique key and is a clean,
-- safe no-op, never a second business transaction.
CREATE TABLE IF NOT EXISTS webhook_events (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id         BIGINT UNSIGNED NOT NULL,
  provider_id       BIGINT UNSIGNED NOT NULL,
  provider_event_id VARCHAR(191) NOT NULL,   -- the provider's own delivery/idempotency id
  event_type        VARCHAR(64) NOT NULL,    -- e.g. 'LAB_RESULT' | 'PHARMACY_FULFILLMENT'
  payload           JSON NOT NULL,           -- raw payload, AFTER signature verification
  signature_valid   TINYINT(1) NOT NULL DEFAULT 1,
  status            ENUM('PENDING','PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'PENDING',
  attempts          INT UNSIGNED NOT NULL DEFAULT 0,
  last_error        VARCHAR(500) NULL,
  received_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at      DATETIME(3) NULL,
  UNIQUE KEY uq_webhook_events_provider_event (provider_id, provider_event_id),
  KEY idx_webhook_events_tenant (tenant_id),
  KEY idx_webhook_events_status (status),
  CONSTRAINT fk_webhook_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_webhook_events_provider FOREIGN KEY (provider_id) REFERENCES external_providers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Analytics rollups ────────────────────────────────────────────────────

-- One row per (tenant, day) — the wide fact table. Computed by a
-- background job (src/lib/analytics/rollup.js), never hand-edited.
CREATE TABLE IF NOT EXISTS analytics_daily_tenant (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id              BIGINT UNSIGNED NOT NULL,
  metric_date            DATE NOT NULL,
  patients_new           INT UNSIGNED NOT NULL DEFAULT 0,
  patients_returning     INT UNSIGNED NOT NULL DEFAULT 0,
  opd_visits             INT UNSIGNED NOT NULL DEFAULT 0,
  admissions             INT UNSIGNED NOT NULL DEFAULT 0,
  discharges             INT UNSIGNED NOT NULL DEFAULT 0,
  avg_los_days           DECIMAL(6,2) NULL,
  appointments_booked    INT UNSIGNED NOT NULL DEFAULT 0,
  appointments_completed INT UNSIGNED NOT NULL DEFAULT 0,
  appointments_cancelled INT UNSIGNED NOT NULL DEFAULT 0,
  appointments_noshow    INT UNSIGNED NOT NULL DEFAULT 0,
  consultations          INT UNSIGNED NOT NULL DEFAULT 0,
  prescriptions_created  INT UNSIGNED NOT NULL DEFAULT 0,
  lab_orders_created     INT UNSIGNED NOT NULL DEFAULT 0,
  lab_orders_completed   INT UNSIGNED NOT NULL DEFAULT 0,
  lab_revenue            DECIMAL(14,2) NOT NULL DEFAULT 0,
  lab_avg_turnaround_hours DECIMAL(8,2) NULL,
  radiology_orders_created   INT UNSIGNED NOT NULL DEFAULT 0,
  radiology_orders_completed INT UNSIGNED NOT NULL DEFAULT 0,
  radiology_revenue          DECIMAL(14,2) NOT NULL DEFAULT 0,
  radiology_avg_turnaround_hours DECIMAL(8,2) NULL,
  pharmacy_items_dispensed   INT UNSIGNED NOT NULL DEFAULT 0,
  pharmacy_dispensed_value   DECIMAL(14,2) NOT NULL DEFAULT 0,
  revenue_total          DECIMAL(14,2) NOT NULL DEFAULT 0,
  collections_total       DECIMAL(14,2) NOT NULL DEFAULT 0,
  refunds_total           DECIMAL(14,2) NOT NULL DEFAULT 0,
  discounts_total         DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_total               DECIMAL(14,2) NOT NULL DEFAULT 0,
  opd_revenue             DECIMAL(14,2) NOT NULL DEFAULT 0,
  ipd_revenue             DECIMAL(14,2) NOT NULL DEFAULT 0,
  outstanding_eod         DECIMAL(14,2) NOT NULL DEFAULT 0,
  staff_present_count     INT UNSIGNED NOT NULL DEFAULT 0,
  staff_on_leave_count    INT UNSIGNED NOT NULL DEFAULT 0,
  beds_total              INT UNSIGNED NOT NULL DEFAULT 0,
  beds_occupied           INT UNSIGNED NOT NULL DEFAULT 0,
  occupancy_pct           DECIMAL(5,2) NOT NULL DEFAULT 0,
  computed_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_analytics_daily_tenant (tenant_id, metric_date),
  KEY idx_analytics_daily_tenant_date (metric_date),
  CONSTRAINT fk_analytics_daily_tenant_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Narrow dimension table — one row per (tenant, day, dimension). Reused
-- across doctor workload, medicine movement, ward occupancy, and external
-- provider usage instead of four separate near-identical tables.
CREATE TABLE IF NOT EXISTS analytics_daily_dimension (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id       BIGINT UNSIGNED NOT NULL,
  metric_date     DATE NOT NULL,
  dimension_type  VARCHAR(20) NOT NULL,   -- 'DOCTOR' | 'MEDICINE' | 'WARD' | 'PROVIDER'
  dimension_key   VARCHAR(100) NOT NULL,  -- doctor_user_id / medicine_name / ward_type / provider_id, as a string
  dimension_label VARCHAR(191) NULL,
  metric_count    INT NOT NULL DEFAULT 0,
  metric_value    DECIMAL(14,2) NOT NULL DEFAULT 0,
  metric_secondary INT NOT NULL DEFAULT 0,
  computed_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_analytics_daily_dimension (tenant_id, metric_date, dimension_type, dimension_key),
  KEY idx_analytics_daily_dimension_lookup (tenant_id, dimension_type, metric_date),
  CONSTRAINT fk_analytics_daily_dimension_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Operational visibility into the rollup job itself — did today's rollup
-- actually run, and did it succeed.
CREATE TABLE IF NOT EXISTS analytics_rollup_runs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id    BIGINT UNSIGNED NULL,   -- NULL = a platform-wide run covering every tenant
  rollup_date  DATE NOT NULL,
  status       ENUM('PENDING','RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  started_at   DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  last_error   VARCHAR(500) NULL,
  row_counts   JSON NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_analytics_rollup_runs_date (rollup_date),
  KEY idx_analytics_rollup_runs_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
