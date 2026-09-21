-- Per-person feature access (admin switches features off for a staff member)
-- and a facility-wide activity log (who did what, when).
ALTER TABLE users ADD COLUMN access_deny TEXT NULL;

CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT UNSIGNED NULL,
  user_id     BIGINT UNSIGNED NULL,
  user_name   VARCHAR(191) NULL,
  user_role   VARCHAR(40) NULL,
  method      VARCHAR(8) NOT NULL,
  path        VARCHAR(255) NOT NULL,
  feature     VARCHAR(30) NULL,
  summary     VARCHAR(255) NOT NULL,
  status_code SMALLINT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_tenant_time (tenant_id, created_at),
  KEY idx_audit_tenant_user (tenant_id, user_id),
  KEY idx_audit_tenant_feature (tenant_id, feature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
