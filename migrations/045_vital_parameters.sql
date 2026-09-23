-- Nursing-note vitals: a fixed BP/Pulse/Temp/SpO2 set never fit every ward
-- (a NICU tracks different things than a general ward). Each hospital now
-- defines its own list, with a normal range per parameter so an
-- out-of-range reading can be flagged automatically instead of a nurse
-- manually picking Normal/High/Low. `range_config` is JSON (MariaDB JSON =
-- LONGTEXT under a CHECK constraint, same as every other JSON-shaped
-- column in this schema, e.g. form_templates.fields):
--   NUMBER -> {"min":97,"max":99}
--   BP     -> {"systolic":{"min":90,"max":120},"diastolic":{"min":60,"max":80}}
--   TEXT   -> never range-checked, range_config stays NULL
CREATE TABLE vital_parameters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(40) NOT NULL,
  label VARCHAR(100) NOT NULL,
  unit VARCHAR(30) NULL,
  value_type ENUM('NUMBER','BP','TEXT') NOT NULL DEFAULT 'NUMBER',
  range_config TEXT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vital_params_tenant_key (tenant_id, field_key),
  KEY idx_vital_params_tenant (tenant_id),
  CONSTRAINT fk_vital_params_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- Backfill: every existing HOSPITAL tenant gets the same 4 parameters
-- nursing notes already captured, now as real, editable rows — so nothing
-- regresses for a tenant that never touches this screen, and every
-- hospital's admin can freely rename/add/remove/re-range from here.
INSERT INTO vital_parameters (tenant_id, field_key, label, unit, value_type, range_config, display_order)
SELECT id, 'bp', 'Blood Pressure', 'mmHg', 'BP', '{"systolic":{"min":90,"max":120},"diastolic":{"min":60,"max":80}}', 1 FROM tenants WHERE type = 'HOSPITAL';
INSERT INTO vital_parameters (tenant_id, field_key, label, unit, value_type, range_config, display_order)
SELECT id, 'pulse', 'Pulse', 'bpm', 'NUMBER', '{"min":60,"max":100}', 2 FROM tenants WHERE type = 'HOSPITAL';
INSERT INTO vital_parameters (tenant_id, field_key, label, unit, value_type, range_config, display_order)
SELECT id, 'temp', 'Temperature', '°F', 'NUMBER', '{"min":97,"max":99}', 3 FROM tenants WHERE type = 'HOSPITAL';
INSERT INTO vital_parameters (tenant_id, field_key, label, unit, value_type, range_config, display_order)
SELECT id, 'spo2', 'SpO2', '%', 'NUMBER', '{"min":95,"max":100}', 4 FROM tenants WHERE type = 'HOSPITAL';
