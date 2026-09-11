-- 008_lab_report.sql — the two extra timestamps the diagnostic report needs
-- (collected / received; `resulted_at` from 001 already covers "reported").
-- Layered on top of 001-007.
--
-- Applied to a LOCAL TEST COPY ONLY by the build process. The project owner
-- applies this to the real database by hand — see CLAUDE.md "Database rule".

ALTER TABLE lab_orders
  ADD COLUMN collected_at DATETIME(3) NULL AFTER ordered_by,
  ADD COLUMN received_at DATETIME(3) NULL AFTER collected_at;
