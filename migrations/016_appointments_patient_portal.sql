-- 016_appointments_patient_portal.sql — base Appointment Scheduling +
-- Patient Portal auth + Feedback. Field/model names below are this
-- project's own convention (BigInt-unsigned ids, snake_case columns),
-- adapted from the pasted spec's Int/camelCase sketch — that sketch was
-- never meant to be applied verbatim (see CLAUDE.md's Prisma section: the
-- schema is introspected, never hand-authored to match an external draft).
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

-- Appointments becomes a real rentable module, same ENUM-extension pattern
-- IPD used in 004_ipd.sql.
ALTER TABLE tenant_modules
  MODIFY module_name ENUM('PHARMACY', 'DOCTOR_OPD', 'LAB', 'BILLING', 'IPD', 'APPOINTMENTS') NOT NULL;

-- A doctor's recurring weekly availability template — NOT actual booked
-- instances (those are `appointments` rows). The staff/patient calendars
-- project this onto real calendar dates at read time.
CREATE TABLE IF NOT EXISTS doctor_slots (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id       BIGINT UNSIGNED NOT NULL,
  doctor_user_id  BIGINT UNSIGNED NOT NULL,
  day_of_week     TINYINT UNSIGNED NOT NULL, -- 0=Sunday .. 6=Saturday
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  slot_minutes    SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_doctor_slots_tenant (tenant_id),
  KEY idx_doctor_slots_doctor_day (tenant_id, doctor_user_id, day_of_week),
  CONSTRAINT chk_doctor_slots_day CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT fk_doctor_slots_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_doctor_slots_doctor FOREIGN KEY (doctor_user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A booked appointment. Double-booking prevention is a genuine insert-time
-- race (unlike Pharmacy's FEFO dispense, which locks an EXISTING stock row
-- with FOR UPDATE — here, before the first booking, there is no row yet to
-- lock, so SELECT-then-INSERT always has a phantom-read race window no
-- amount of application-level locking closes on its own). The standard,
-- correct fix for "two people book the last slot at once" is a real unique
-- constraint that makes the second concurrent INSERT fail atomically at the
-- storage-engine level — see uq_appointments_doctor_active_slot below —
-- with the API catching that failure and returning 409. This is the same
-- transactional-integrity discipline as FEFO's locking, just the mechanism
-- suited to "creating a new contested row" instead of "depleting an
-- existing one."
--
-- `active_slot_time` is a generated column: it equals `slot_time` for every
-- status that still holds the slot (BOOKED/CONFIRMED/COMPLETED/NO_SHOW —
-- per the product rule that only a clean CANCELLED reopens a slot; a
-- no-show is recorded but does NOT reopen it) and NULL for CANCELLED. MySQL
-- unique indexes never treat two NULLs as duplicates, so a cancelled
-- appointment's row can coexist with a brand-new booking on that same
-- doctor+time — while two simultaneously-BOOKED rows on the same doctor+
-- time genuinely collide and one insert fails, exactly as intended.
CREATE TABLE IF NOT EXISTS appointments (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  patient_id         BIGINT UNSIGNED NOT NULL,
  doctor_user_id     BIGINT UNSIGNED NOT NULL,
  slot_time          DATETIME NOT NULL,
  status             ENUM('BOOKED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')
                       NOT NULL DEFAULT 'BOOKED',
  booked_by          ENUM('staff', 'patient') NOT NULL,
  reason             VARCHAR(500) NULL,
  active_slot_time   DATETIME GENERATED ALWAYS AS
                       (CASE WHEN status = 'CANCELLED' THEN NULL ELSE slot_time END) STORED,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_appointments_doctor_active_slot (tenant_id, doctor_user_id, active_slot_time),
  KEY idx_appointments_tenant (tenant_id),
  KEY idx_appointments_patient (tenant_id, patient_id),
  KEY idx_appointments_doctor_time (tenant_id, doctor_user_id, slot_time),
  CONSTRAINT fk_appointments_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Patient-submitted feedback, once per completed visit (UNIQUE key is the
-- DB-level half of that rule; the API re-checks too, same defense-in-depth
-- pattern as everywhere else in this project).
CREATE TABLE IF NOT EXISTS feedback (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id   BIGINT UNSIGNED NOT NULL,
  visit_id    BIGINT UNSIGNED NOT NULL,
  patient_id  BIGINT UNSIGNED NOT NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  comment     VARCHAR(2000) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_feedback_visit (tenant_id, visit_id),
  KEY idx_feedback_tenant (tenant_id),
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_feedback_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Patient portal auth: a genuinely separate session type from staff login
-- (see src/lib/patientAuth.js). Patients are not `users` rows with a role —
-- they authenticate against their own `patients` record via phone+OTP,
-- scoped to one tenant (the owner chose per-tenant login over a unified
-- cross-tenant identity: this project's whole security model is built on
-- strict tenant isolation, and phone numbers are not guaranteed globally
-- unique to one person — a shared household line would otherwise leak one
-- family's records into another's session). OTP fields live directly on
-- `patients` since only one outstanding code per patient makes sense (a new
-- request invalidates the previous one) — no separate history table needed
-- for this.
ALTER TABLE patients
  ADD COLUMN otp_code_hash    VARCHAR(255) NULL AFTER phone,
  ADD COLUMN otp_expires_at   DATETIME(3) NULL AFTER otp_code_hash,
  ADD COLUMN otp_requested_at DATETIME(3) NULL AFTER otp_expires_at,
  ADD COLUMN otp_attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER otp_requested_at;
