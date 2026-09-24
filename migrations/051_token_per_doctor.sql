-- Token numbers now run per doctor per day (each doctor's queue starts at 1).
-- doctor_key folds "no doctor assigned" into 0 so the unique key still holds for unassigned visits
-- (a plain NULL would never collide, and two identical tokens could slip through).
-- A stored generated column cannot sit on a column whose FK is ON DELETE SET NULL, so the doctor FK
-- becomes RESTRICT (doctors are deactivated, never deleted).
ALTER TABLE visits DROP FOREIGN KEY fk_visits_doctor;
ALTER TABLE visits
  ADD CONSTRAINT fk_visits_doctor FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN doctor_key BIGINT UNSIGNED GENERATED ALWAYS AS (IFNULL(doctor_id, 0)) STORED AFTER doctor_id,
  ADD UNIQUE KEY uq_visits_tenant_date_doctor_token (tenant_id, visit_date, doctor_key, token_number),
  DROP INDEX uq_visits_tenant_date_token;
