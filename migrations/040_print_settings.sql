-- Per-facility print settings (registration slip / receipt paper size, what to show).
ALTER TABLE tenants ADD COLUMN print_settings TEXT NULL;
