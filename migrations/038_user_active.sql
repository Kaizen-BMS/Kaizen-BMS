-- Staff logins can be switched off (and back on) without deleting their history.
ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;
