-- 018_token_override_unique.sql — a real DB-level unique constraint behind
-- the manual token override added in 017. The app-level check-then-insert
-- in resolveTokenNumber() stays as the first line (it gives a clean 409
-- message), but it alone cannot close the race: an override is specifically
-- for priority/emergency situations, which is exactly when two receptionists
-- on different terminals are most likely to race for the same "obviously
-- correct" number — matching the same reasoning already applied to
-- Appointment double-booking (migration 016) and Feedback's once-per-visit
-- rule, just applied here too on review.
--
-- `created_at` is a DATETIME (has a time-of-day), so "same day" can't be
-- expressed directly in a UNIQUE key without materializing it — same
-- generated-column technique as appointments.active_slot_time. NULL
-- token_number (DIRECT_ADMISSION/EMERGENCY visits, which never get a
-- walk-in token) never collides with itself or anything else, since NULL
-- is never equal to NULL in a unique index — only visits that actually
-- HAVE a token number are constrained, which is exactly the set this
-- needs to protect.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).
-- Checked first: no existing (tenant_id, day, token_number) duplicates in
-- the live data, so this applies cleanly (a UNIQUE key add fails outright
-- over pre-existing duplicates).

ALTER TABLE visits
  ADD COLUMN visit_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED AFTER created_at,
  ADD UNIQUE KEY uq_visits_tenant_date_token (tenant_id, visit_date, token_number);
