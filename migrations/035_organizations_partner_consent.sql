-- Owner organization hierarchy + two-sided partner connection consent.
--
-- Least-disruptive model: `tenants` stays THE facility layer (every
-- existing tenant-scoped table, session, and isolation guarantee keeps
-- working untouched). Only a thin OWNERSHIP layer is added above it:
--   organizations (a business group) -> tenants (facilities)
--   organization_members (which USERS own an organization)
-- One user identity can own several facilities; switching facility just
-- re-issues the session with a different tenant id after a membership check.
--
-- Partner connections reuse the existing external-integration foundation
-- (external_providers / external_credentials / external_connections) for
-- the actual data exchange; org_connections only adds what was genuinely
-- missing — the RECEIVER's consent, per-category approval, and its audit
-- trail — plus peer_inbound_orders, the receiving side's copy of an order
-- (approved fields only).

CREATE TABLE organizations (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(191) NOT NULL,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE organization_members (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  role            ENUM('OWNER') NOT NULL DEFAULT 'OWNER',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_members (organization_id, user_id),
  KEY idx_org_members_user (user_id),
  CONSTRAINT fk_org_members_org  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE tenants
  ADD COLUMN organization_id BIGINT UNSIGNED NULL,
  ADD COLUMN public_code VARCHAR(32) NULL,
  ADD COLUMN owner_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD KEY idx_tenants_org (organization_id),
  ADD CONSTRAINT fk_tenants_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL;

-- Backfill: one organization per existing tenant (named after it), and the
-- tenant's admin/owner login(s) become that organization's OWNER — exactly
-- who effectively owns each tenant today.
INSERT INTO organizations (name) SELECT CONCAT('__t', id) FROM tenants;
UPDATE tenants t JOIN organizations o ON o.name = CONCAT('__t', t.id) SET t.organization_id = o.id;
UPDATE organizations o SET o.name = (SELECT t.name FROM tenants t WHERE t.organization_id = o.id LIMIT 1) WHERE o.name LIKE '\_\_t%';

INSERT INTO organization_members (organization_id, user_id)
  SELECT t.organization_id, u.id FROM users u JOIN tenants t ON t.id = u.tenant_id
   WHERE u.role IN ('HOSPITAL_ADMIN','OWNER_DOCTOR','OWNER_PHARMACIST','OWNER_LAB_TECH');

-- Public facility code (what a partner types to find a facility). Random,
-- not derived from the internal id, so it neither leaks nor is guessable
-- from it.
UPDATE tenants SET public_code = CONCAT(
    CASE type WHEN 'HOSPITAL' THEN 'HOSPITAL' WHEN 'LAB_SOLO' THEN 'LAB' WHEN 'PHARMACY_SOLO' THEN 'PHARMACY' ELSE 'CLINIC' END,
    '-KZ-', UPPER(SUBSTRING(MD5(CONCAT(id, name, RAND())), 1, 4)))
  WHERE public_code IS NULL;
ALTER TABLE tenants ADD UNIQUE KEY uq_tenants_public_code (public_code);

CREATE TABLE org_connections (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requester_tenant_id      BIGINT UNSIGNED NOT NULL,
  receiver_tenant_id       BIGINT UNSIGNED NOT NULL,
  service_type             ENUM('LAB','PHARMACY') NOT NULL,
  purpose                  VARCHAR(255) NOT NULL,
  status                   ENUM('REQUESTED','REVIEWING','ACCEPTED','ACTIVE','PAUSED','REJECTED','REVOKED') NOT NULL DEFAULT 'REQUESTED',
  requested_categories     TEXT NOT NULL,
  approved_categories      TEXT NULL,
  contract_versions        TEXT NULL,
  requested_by             BIGINT UNSIGNED NOT NULL,
  decided_by               BIGINT UNSIGNED NULL,
  modified_by              BIGINT UNSIGNED NULL,
  revoked_by               BIGINT UNSIGNED NULL,
  paused_by_tenant_id      BIGINT UNSIGNED NULL,
  requester_provider_id    BIGINT UNSIGNED NULL,
  requester_connection_id  BIGINT UNSIGNED NULL,
  requested_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at              DATETIME NULL,
  rejected_at              DATETIME NULL,
  paused_at                DATETIME NULL,
  revoked_at               DATETIME NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 1 while the relationship is still "open" (anything except REJECTED/
  -- REVOKED), else NULL — same NULL-never-equals-NULL trick used for
  -- appointments/tariffs: at most one open connection per (requester,
  -- receiver, service), but a fresh request after a rejection/revocation is
  -- a brand-new record needing brand-new consent (a revoked connection is
  -- never silently revived).
  open_slot                TINYINT GENERATED ALWAYS AS (CASE WHEN status IN ('REQUESTED','REVIEWING','ACCEPTED','ACTIVE','PAUSED') THEN 1 ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_connections_open (requester_tenant_id, receiver_tenant_id, service_type, open_slot),
  KEY idx_org_connections_receiver (receiver_tenant_id, status),
  KEY idx_org_connections_requester (requester_tenant_id, status),
  KEY fk_org_connections_requested_by (requested_by),
  CONSTRAINT fk_org_connections_requester FOREIGN KEY (requester_tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_connections_receiver  FOREIGN KEY (receiver_tenant_id)  REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_connections_requested_by FOREIGN KEY (requested_by) REFERENCES users (id),
  CONSTRAINT chk_org_connections_distinct CHECK (requester_tenant_id <> receiver_tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE org_connection_events (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_connection_id BIGINT UNSIGNED NOT NULL,
  from_status       VARCHAR(20) NULL,
  to_status         VARCHAR(20) NOT NULL,
  actor_user_id     BIGINT UNSIGNED NULL,
  actor_tenant_id   BIGINT UNSIGNED NULL,
  note              VARCHAR(500) NULL,
  snapshot          TEXT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_org_conn_events_conn (org_connection_id),
  CONSTRAINT fk_org_conn_events_conn FOREIGN KEY (org_connection_id) REFERENCES org_connections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE peer_inbound_orders (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  org_connection_id  BIGINT UNSIGNED NOT NULL,
  order_type         VARCHAR(30) NOT NULL,
  external_order_ref VARCHAR(64) NOT NULL,
  payload            LONGTEXT NOT NULL,
  status             ENUM('RECEIVED','COMPLETED','REJECTED') NOT NULL DEFAULT 'RECEIVED',
  result_payload     TEXT NULL,
  received_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at       DATETIME NULL,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_peer_inbound_ref (org_connection_id, external_order_ref),
  KEY idx_peer_inbound_tenant (tenant_id, status),
  CONSTRAINT fk_peer_inbound_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_peer_inbound_conn   FOREIGN KEY (org_connection_id) REFERENCES org_connections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
