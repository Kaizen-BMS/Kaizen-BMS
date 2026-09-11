-- 012_billing_idempotency.sql — idempotency keys on payments/discounts/
-- refunds. Found empirically: a Prisma interactive transaction that hits
-- its client-side timeout does NOT guarantee the writes already sent over
-- the wire are undone before the connection is reused (confirmed against
-- prisma/prisma#13713 and community reports — "Prisma will roll it back,
-- but it doesn't automatically cancel any in progress queries") — a client
-- that sees a timeout/500 and retries a "record payment" call can end up
-- with two payment rows for one real payment. Standard fix for any
-- money-movement endpoint over an unreliable connection: the client sends
-- a per-attempt idempotency key; the server returns the existing row
-- instead of creating a new one if that key was already used on this bill.
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

ALTER TABLE payments
  ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER bill_id,
  ADD UNIQUE KEY uq_payments_bill_idempotency (bill_id, idempotency_key);

ALTER TABLE discounts
  ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER bill_id,
  ADD UNIQUE KEY uq_discounts_bill_idempotency (bill_id, idempotency_key);

ALTER TABLE refunds
  ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER bill_id,
  ADD UNIQUE KEY uq_refunds_bill_idempotency (bill_id, idempotency_key);
