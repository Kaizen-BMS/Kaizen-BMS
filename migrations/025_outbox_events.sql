-- Phase 4 of the platform rebuild (see CLAUDE.md "Outbox — durable domain
-- events"): a durable business-event record, written atomically alongside
-- the business write it represents, so a crash between "the DB write
-- committed" and "something told another module about it" can never lose
-- the event. This is deliberately ADDITIVE and SEPARATE from:
--   - Socket.io realtime (emitToTenant/emitToModule) — stays exactly as it
--     is, zero-delay, same request cycle; this table is never in that path.
--   - module_connection_events — that's the audit trail for a configured
--     Module Connection's own lifecycle (PENDING/ACTIVE/PAUSED/...), a
--     completely different concern from "a business fact happened."
CREATE TABLE IF NOT EXISTS outbox_events (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Stable identity across retries/redelivery — the one thing a consumer
  -- needs to dedupe on if it has a side effect that must not double-fire.
  event_id          CHAR(36) NOT NULL,
  tenant_id         BIGINT UNSIGNED NOT NULL,
  -- e.g. "AppointmentBooked" — see src/lib/outbox.js for the current
  -- catalog; deliberately a plain string, not an ENUM, since new event
  -- types are expected to be added without a migration once the pattern
  -- is proven (same reasoning as token_overrides.reason being free text).
  event_type        VARCHAR(64) NOT NULL,
  aggregate_type    VARCHAR(64) NOT NULL,
  aggregate_id      BIGINT UNSIGNED NOT NULL,
  -- ID-first, minimal payload — never PHI, never secrets. See
  -- src/lib/outbox.js's contracts for what each event_type actually
  -- carries. MariaDB's JSON is LONGTEXT under a CHECK constraint, same as
  -- every other JSON-shaped column already in this schema
  -- (patients.custom_fields, module_connections.allowed_fields, ...).
  payload           JSON NOT NULL,
  payload_version   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status            ENUM('PENDING','PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'PENDING',
  attempts          INT UNSIGNED NOT NULL DEFAULT 0,
  -- When this row is next eligible to be claimed — NOW() on insert, pushed
  -- forward on a failed attempt (bounded exponential backoff, see
  -- src/lib/outboxProcessor.js), so the claim query is a single simple
  -- index scan rather than a per-row "is it time yet" computation.
  available_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at        DATETIME NULL,
  processed_at      DATETIME NULL,
  last_error        VARCHAR(1000) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_outbox_events_event_id (event_id),
  KEY idx_outbox_events_status_available (status, available_at),
  KEY idx_outbox_events_tenant (tenant_id),
  KEY idx_outbox_events_aggregate (aggregate_type, aggregate_id),
  CONSTRAINT fk_outbox_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
