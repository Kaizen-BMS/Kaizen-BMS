-- The piece inside the stocked/sold unit — e.g. unit="Strip", content_unit="Tablet", content_per_pack=10
-- ("10 Tablets per Strip"), or unit="Bottle", content_unit="ml", content_per_pack=100. A real structured
-- pair (not the free-text pack_size column, which stays for backward compatibility/display only) so
-- per-piece pricing is calculated from an actual number, never parsed out of a description string.
ALTER TABLE medicines
  ADD COLUMN content_unit VARCHAR(30) NULL AFTER pack_size,
  ADD COLUMN content_per_pack INT UNSIGNED NULL AFTER content_unit;
