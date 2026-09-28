-- Per-user toast/notification category preferences — which of the small, code-defined event
-- categories (see src/components/hms/Toasts.jsx) a user wants surfaced as a toast. NULL means
-- "no preferences saved yet" (every category on, today's existing behavior) rather than an empty
-- object meaning "everything off" — same nullable-JSON-blob-of-toggles pattern already used for
-- patients.custom_fields/allergies. Per-USER, not per-tenant: two staff at the same hospital may
-- legitimately want different noise levels.
ALTER TABLE users
  ADD COLUMN notification_prefs JSON NULL AFTER role;
