-- 006_nurse_and_gender.sql — a dedicated NURSE role (ward/bed status and
-- nursing notes are nurse-run, not doctor-run) + patients.gender (needed on
-- the prescription/lab-report print templates). Layered on top of 001-005.
--
-- Applied to a LOCAL TEST COPY ONLY by the build process. The project owner
-- applies this to the real database by hand — see CLAUDE.md "Database rule".

ALTER TABLE users
  MODIFY role ENUM(
    'SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'PHARMACIST', 'LAB_TECH',
    'BILLING_STAFF', 'RECEPTIONIST', 'NURSE',
    'OWNER_DOCTOR', 'OWNER_PHARMACIST', 'OWNER_LAB_TECH'
  ) NOT NULL;

ALTER TABLE patients
  ADD COLUMN gender ENUM('MALE', 'FEMALE', 'OTHER') NULL AFTER age;
