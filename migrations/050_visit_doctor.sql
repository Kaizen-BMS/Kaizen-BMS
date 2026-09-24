-- Registration picks the consulting doctor; each doctor then has their own waiting list.
-- Nullable: older visits, and "any available doctor", have none.
ALTER TABLE visits
  ADD COLUMN doctor_id BIGINT UNSIGNED NULL AFTER registered_by,
  ADD KEY idx_visits_doctor (tenant_id, doctor_id, status),
  ADD CONSTRAINT fk_visits_doctor FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE RESTRICT;
