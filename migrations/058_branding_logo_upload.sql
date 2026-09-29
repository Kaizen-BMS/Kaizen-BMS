-- Widen print_branding.logo_url from VARCHAR(500) to MEDIUMTEXT so the new
-- "browse a file" logo upload (Branding screen) can store a client-side
-- compressed data URL directly, the same no-file-storage convention already
-- used for signature_image on this same table and for Attendance/Insurance
-- photos elsewhere. A short http(s) URL still fits fine in MEDIUMTEXT too,
-- so nothing already stored here needs to change shape.
ALTER TABLE print_branding
  MODIFY COLUMN logo_url MEDIUMTEXT NULL;
