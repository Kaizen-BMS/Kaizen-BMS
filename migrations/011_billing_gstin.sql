-- 011_billing_gstin.sql — GSTIN on the tenant's print_branding, so the
-- billing receipt (print/receipt/[billId]) can show it on the invoice
-- header like the rest of a tax invoice's required fields. Optional —
-- NULL until the tenant fills it in on the branding screen. Applied via
-- the automatic backup-then-apply flow (npm run db:migrate).

ALTER TABLE print_branding
  ADD COLUMN gstin VARCHAR(20) NULL AFTER phone;
