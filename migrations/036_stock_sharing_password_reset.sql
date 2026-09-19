-- Stock availability sharing + password reset.
--  * tenants.show_stock_to_doctors: a facility's OWN pharmacy availability is
--    shown to its doctors while prescribing (on by default, can be turned off).
--  * org_connections.share_stock: a partner pharmacy may choose to let the
--    connected hospital's doctors see "available / not available" (never
--    quantities) for a medicine. Off until the pharmacy switches it on.
--  * password_resets: single-use, hashed, expiring reset tokens.
ALTER TABLE tenants ADD COLUMN show_stock_to_doctors TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE org_connections ADD COLUMN share_stock TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE password_resets (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_token (token_hash),
  KEY idx_password_resets_user (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
