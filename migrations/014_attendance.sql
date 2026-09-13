-- 014_attendance.sql — staff attendance: self check-in/out for staff with
-- login accounts, receptionist-proxy check-in/out (with a photo) for
-- employees who have no system login (e.g. sweepers, ward staff), and an
-- intra-shift "stepped out" break with a reason (PERSONAL time is deducted
-- from worked hours at report time, HOSPITAL_WORK time is not — both are
-- computed from timestamps, never stored as a derived total).
--
-- Two kinds of people can have attendance: a `users` row (self-service) or a
-- `staff_members` row (a lightweight, tenant-owned directory for people who
-- never get a login). `staff_members` follows the same "the system builds
-- itself" philosophy as referral_sources — nothing pre-filled, a hospital
-- adds its own sweepers/ward-staff/etc.
--
-- attendance_logs models "which person" as (subject_type, subject_id) rather
-- than two nullable FK columns (one to users, one to staff_members): a real
-- FK can't point at "users OR staff_members" conditionally, and two nullable
-- FK columns can't be uniquely constrained together in MySQL (NULL is never
-- considered equal to NULL in a unique index, so duplicate check-ins for the
-- same person would slip through). This polymorphic-reference shape is the
-- same idea already used for bill_items.reference_type/reference_id. It
-- keeps a genuine DB-level "one row per person per day" guarantee via
-- uq_attendance_logs_subject_day.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

CREATE TABLE IF NOT EXISTS staff_members (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(191) NOT NULL,
  designation  VARCHAR(100) NULL,
  phone        VARCHAR(32) NULL,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_staff_members_tenant (tenant_id),
  KEY idx_staff_members_tenant_active (tenant_id, active),
  CONSTRAINT fk_staff_members_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_logs (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id            BIGINT UNSIGNED NOT NULL,
  subject_type         ENUM('USER', 'STAFF_MEMBER') NOT NULL,
  subject_id           BIGINT UNSIGNED NOT NULL,
  work_date            DATE NOT NULL,
  check_in_at          DATETIME(3) NULL,
  check_in_photo_url   MEDIUMTEXT NULL,
  check_out_at         DATETIME(3) NULL,
  check_out_photo_url  MEDIUMTEXT NULL,
  marked_by            BIGINT UNSIGNED NOT NULL,
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_attendance_logs_subject_day (tenant_id, subject_type, subject_id, work_date),
  KEY idx_attendance_logs_tenant_date (tenant_id, work_date),
  CONSTRAINT fk_attendance_logs_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_logs_marked_by FOREIGN KEY (marked_by)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- An intra-shift "stepped out" period. `in_at IS NULL` means still out.
-- PERSONAL is deducted from worked time when reported; HOSPITAL_WORK is not
-- (the person is still on hospital business, just physically elsewhere).
CREATE TABLE IF NOT EXISTS attendance_breaks (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  attendance_log_id  BIGINT UNSIGNED NOT NULL,
  out_at             DATETIME(3) NOT NULL,
  in_at              DATETIME(3) NULL,
  category           ENUM('PERSONAL', 'HOSPITAL_WORK') NOT NULL,
  reason             VARCHAR(255) NOT NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_attendance_breaks_tenant (tenant_id),
  KEY idx_attendance_breaks_log (attendance_log_id),
  CONSTRAINT fk_attendance_breaks_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_breaks_log FOREIGN KEY (attendance_log_id)
    REFERENCES attendance_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
