-- A real signature image (not just a name typed under a line) at the
-- signature line of a printed prescription / lab report. Same "no file
-- storage in this project" convention as attendance photos / insurance
-- cards: a client-compressed image stored directly as a data URL.
ALTER TABLE print_branding
  ADD COLUMN signature_image MEDIUMTEXT NULL;
