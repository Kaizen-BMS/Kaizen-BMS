-- 029_consultation_price_snapshot_fix.sql — Phase 7 same-day fix: the
-- original 028 migration gave `consultations` a price snapshot (service_id,
-- tariff_id, taxable_amount, tax_rate, CGST/SGST/IGST, tax_amount) but
-- missed `unit_price` — CLAUDE.md Phase 7 instruction #8 requires it on
-- every tariff-backed BillItem. (`quantity` is deliberately NOT added here —
-- a consultation is inherently always exactly one line; bill_items.quantity
-- already correctly defaults to 1.00 without needing an echo from this
-- table.) Caught immediately while verifying the first live tariff-backed
-- consultation (its bill_item came back with unit_price=null). Additive,
-- never editing the already-applied 028 — same discipline as migration
-- 026's occurredAt fix.
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

ALTER TABLE consultations
  ADD COLUMN unit_price DECIMAL(12, 2) NULL AFTER tariff_id;
