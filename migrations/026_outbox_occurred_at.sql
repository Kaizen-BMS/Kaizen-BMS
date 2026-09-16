-- Phase 4 hardening patch: adds the `occurred_at` field the originally-
-- approved event envelope always specified
-- (eventId, tenantId, eventType, aggregateType, aggregateId,
-- payloadVersion, occurredAt, payload) but migration 025 omitted.
--
-- `created_at` stays exactly what it already was — infrastructure
-- metadata, "when this outbox row was persisted." `occurred_at` is the
-- distinct DOMAIN concept, "when the business event itself happened."
-- For every event this project writes today they're the same instant,
-- since every outbox row is created synchronously inside the same
-- transaction as the business write it represents — but collapsing them
-- into one column would foreclose a real future case this table is
-- explicitly meant to support: a delayed, imported, or replayed event
-- whose `occurred_at` predates when the row was actually written.
--
-- Added nullable first, backfilled from the (identical, at this table's
-- current age) `created_at`, then locked to NOT NULL — the standard safe
-- three-step shape for adding a required column to a table that may
-- already hold rows (this one happens to hold zero today, verified
-- before writing this migration, but the migration doesn't assume that).
ALTER TABLE outbox_events
  ADD COLUMN occurred_at DATETIME NULL AFTER aggregate_id;

UPDATE outbox_events SET occurred_at = created_at WHERE occurred_at IS NULL;

ALTER TABLE outbox_events
  MODIFY COLUMN occurred_at DATETIME NOT NULL;
