-- 020_patient_email.sql — adds an optional `email` column to `patients`,
-- for real email OTP delivery (replacing the console-logged stub). No
-- patient currently has one on file (the column didn't exist at all
-- before this), so this is deliberately nullable/optional, not required —
-- owner's explicit choice: front-desk walk-in registration stays
-- phone-only for now; a patient without an email on file simply can't use
-- email-OTP login yet (a clear "no email on file" message, not a silent
-- failure — see /api/patient-auth/request-otp).
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

ALTER TABLE patients
  ADD COLUMN email VARCHAR(191) NULL AFTER phone;
