-- Lab test sets/panels (e.g. "CBC Panel" = Hemoglobin + RBC + WBC ...).
-- A panel belongs to the lab that offers it; components are plain test names
-- (optionally mapped to the lab's own priced test via service_id).
CREATE TABLE lab_panels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  sample_type VARCHAR(60) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_panels_tenant_name (tenant_id, name),
  KEY idx_lab_panels_tenant (tenant_id),
  CONSTRAINT fk_lab_panels_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
CREATE TABLE lab_panel_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  panel_id BIGINT UNSIGNED NOT NULL,
  test_name VARCHAR(191) NOT NULL,
  service_id BIGINT UNSIGNED NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_lab_panel_items_panel (panel_id),
  KEY idx_lab_panel_items_tenant (tenant_id),
  CONSTRAINT fk_lab_panel_items_panel FOREIGN KEY (panel_id) REFERENCES lab_panels (id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_panel_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- Staff: employee id / department / fixed-or-shift duty on the profile;
-- a weekly schedule per person (configured once) and reusable shift templates.
ALTER TABLE staff_profiles
  ADD COLUMN employee_id VARCHAR(40) NULL,
  ADD COLUMN department VARCHAR(100) NULL,
  ADD COLUMN duty_type ENUM('FIXED','SHIFT') NOT NULL DEFAULT 'FIXED',
  ADD COLUMN duty_start TIME NULL,
  ADD COLUMN duty_end TIME NULL;

CREATE TABLE staff_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  is_off TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_schedules_day (tenant_id, user_id, day_of_week),
  KEY idx_staff_schedules_tenant (tenant_id),
  CONSTRAINT fk_staff_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_schedules_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE shift_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shift_templates_name (tenant_id, name),
  KEY idx_shift_templates_tenant (tenant_id),
  CONSTRAINT fk_shift_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);

-- Append-only staff history: duty/roster changes, corrections, approvals.
CREATE TABLE staff_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  detail VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_staff_history_user (tenant_id, user_id, created_at),
  CONSTRAINT fk_staff_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

INSERT INTO shift_templates (tenant_id, name, start_time, end_time)
SELECT id, 'General Shift', '09:00:00', '17:00:00' FROM tenants WHERE type = 'HOSPITAL';
INSERT INTO shift_templates (tenant_id, name, start_time, end_time)
SELECT id, 'Night Shift', '17:00:00', '01:00:00' FROM tenants WHERE type = 'HOSPITAL';
