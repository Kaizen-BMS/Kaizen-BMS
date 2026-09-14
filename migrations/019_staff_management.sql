-- 019_staff_management.sql — Staff directory, duty roster, and leave
-- requests for staff WITH a login (`users`) — distinct from `staff_members`
-- (migration 014), which is the no-login employee directory for Attendance
-- proxy check-in. Field/model names translated to this project's own
-- convention (BigInt-unsigned ids, snake_case columns) from the pasted
-- spec's Int/camelCase sketch, same as every other pasted-spec migration.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

-- Supplementary profile data for a `users` row — join date, phone,
-- free-text designation ("Senior Nurse", "Duty Doctor"). One per user.
CREATE TABLE IF NOT EXISTS staff_profiles (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  join_date    DATE NULL,
  phone        VARCHAR(32) NULL,
  designation  VARCHAR(100) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_staff_profiles_user (user_id),
  KEY idx_staff_profiles_tenant (tenant_id),
  CONSTRAINT fk_staff_profiles_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_profiles_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A concrete shift assignment for one user on one date — not a recurring
-- template (unlike doctor_slots). Multiple rows per user per day are
-- allowed (split shifts); no uniqueness constraint, matching the spec's
-- flat shape.
CREATE TABLE IF NOT EXISTS duty_shifts (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id   BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  shift_date  DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_duty_shifts_tenant (tenant_id),
  KEY idx_duty_shifts_tenant_date (tenant_id, shift_date),
  KEY idx_duty_shifts_user (user_id),
  CONSTRAINT fk_duty_shifts_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_duty_shifts_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_duty_shifts_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A staff member's own leave request. `reason` is a privacy boundary, not
-- just a UI nicety: a colleague can see the dates (for scheduling
-- awareness) but never the reason — enforced server-side in the read API,
-- not by hiding a field in the UI.
CREATE TABLE IF NOT EXISTS leave_requests (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  from_date    DATE NOT NULL,
  to_date      DATE NOT NULL,
  reason       VARCHAR(500) NOT NULL,
  status       ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  approved_by  BIGINT UNSIGNED NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  decided_at   DATETIME(3) NULL,
  KEY idx_leave_requests_tenant (tenant_id),
  KEY idx_leave_requests_tenant_user (tenant_id, user_id),
  KEY idx_leave_requests_tenant_status (tenant_id, status),
  CONSTRAINT chk_leave_requests_dates CHECK (to_date >= from_date),
  CONSTRAINT fk_leave_requests_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_requests_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_requests_approved_by FOREIGN KEY (approved_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
