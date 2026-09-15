-- Phase 3 of the platform rebuild: the data model for the Module
-- Connection Center (CLAUDE.md "Platform rebuild"). A connection is an
-- explicit, approved, revocable relationship between two module
-- instances, carrying exactly which fields of which data contract cross
-- the boundary and what actions are permitted — never "share everything."
--
-- Same-tenant only for this phase: source and target must belong to the
-- same tenant_id (enforced in src/lib/moduleConnections.js, the FKs alone
-- only guarantee each instance exists SOMEWHERE, same reasoning already
-- documented for referral_sources' cross-tenant check). Cross-tenant
-- connections (a standalone Pharmacy serving a Hospital) are a real future
-- case the schema doesn't block — tenant_id is stored on the connection
-- itself, independent of the two instances' own tenant_ids, specifically
-- so a later phase can support one being the "requesting" tenant without
-- a schema change — but no route in this phase creates or approves one.
CREATE TABLE IF NOT EXISTS module_connections (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- The tenant this connection is administered under — for a same-tenant
  -- connection (the only kind this phase creates) this equals both
  -- instances' own tenant_id.
  tenant_id           BIGINT UNSIGNED NOT NULL,
  source_instance_id  BIGINT UNSIGNED NOT NULL,
  target_instance_id  BIGINT UNSIGNED NOT NULL,
  -- Code-defined catalog key into src/lib/dataContracts.js
  -- (CONNECTION_TYPES) — e.g. "PRESCRIPTION_FULFILLMENT". The contract's
  -- full field list is code-defined there, same "core fields code-defined,
  -- selection is tenant data" split already used by form_templates.
  connection_type     VARCHAR(64) NOT NULL,
  status              ENUM('PENDING','ACTIVE','PAUSED','SUSPENDED','REVOKED') NOT NULL DEFAULT 'PENDING',
  -- Which of the contract's declared fields are actually enabled for THIS
  -- connection, and which of view/create/update/delete it grants — a
  -- subset of the contract's full field list, validated against it in
  -- src/lib/dataContracts.js, never sent to the client uninterpreted.
  allowed_fields      JSON NULL,
  permissions         JSON NULL,
  created_by          BIGINT UNSIGNED NOT NULL,
  approved_by         BIGINT UNSIGNED NULL,
  approved_at         DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_module_connections_pair_type (source_instance_id, target_instance_id, connection_type),
  KEY idx_module_connections_tenant (tenant_id),
  KEY idx_module_connections_source (source_instance_id),
  KEY idx_module_connections_target (target_instance_id),
  CONSTRAINT fk_module_connections_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_module_connections_source FOREIGN KEY (source_instance_id) REFERENCES module_instances(id),
  CONSTRAINT fk_module_connections_target FOREIGN KEY (target_instance_id) REFERENCES module_instances(id),
  CONSTRAINT fk_module_connections_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_module_connections_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only status history — "the log IS the audit trail," same pattern
-- as bed_transfers / pharmacy_stock_movements / token_overrides. Never
-- edited or deleted; a connection's full lifecycle stays reconstructable
-- even after REVOKED.
CREATE TABLE IF NOT EXISTS module_connection_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  connection_id  BIGINT UNSIGNED NOT NULL,
  from_status    ENUM('PENDING','ACTIVE','PAUSED','SUSPENDED','REVOKED') NULL,
  to_status      ENUM('PENDING','ACTIVE','PAUSED','SUSPENDED','REVOKED') NOT NULL,
  actor_user_id  BIGINT UNSIGNED NULL,
  note           VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_module_connection_events_connection (connection_id),
  CONSTRAINT fk_module_connection_events_connection FOREIGN KEY (connection_id) REFERENCES module_connections(id) ON DELETE CASCADE,
  CONSTRAINT fk_module_connection_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
