-- Blood group for the staff card / emergency reference. Optional, self-reported, never inferred.
ALTER TABLE staff_profiles ADD COLUMN blood_group VARCHAR(5) NULL AFTER emergency_contact;
