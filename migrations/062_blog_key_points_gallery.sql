-- Blog CMS, Part 2 — "advanced" per the owner's follow-up request: every
-- post can now carry a short Key Takeaways list (shown prominently near
-- the top of the article, not buried in prose) and a photo gallery beyond
-- the single cover image. Both additive, nullable — every existing post
-- (the 3 seeded ones, migration 061) simply has neither yet, and renders
-- exactly as before until an admin adds some.
--
-- JSON columns, same shape/convention as module_connections.allowed_fields
-- (migration 024) — MariaDB stores JSON as LONGTEXT under a CHECK
-- constraint, same as every other JSON-shaped column in this schema.
--
-- Backed up automatically by scripts/dbApplyGuard.js before this runs.

ALTER TABLE blog_posts
  ADD COLUMN key_points JSON NULL AFTER content,
  ADD COLUMN gallery_images JSON NULL AFTER key_points;
