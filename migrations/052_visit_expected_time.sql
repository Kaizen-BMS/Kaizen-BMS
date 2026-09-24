-- The expected time is worked out once, when the patient is registered, and kept — so a reprinted
-- slip shows the same time the patient was first told.
ALTER TABLE visits ADD COLUMN expected_time CHAR(5) NULL AFTER doctor_key;
