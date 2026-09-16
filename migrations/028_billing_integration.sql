-- 028_billing_integration.sql — Phase 7: connect the Service/Tariff master
-- (migration 027) to the OPD/Lab/Pharmacy/IPD flows that actually create
-- bill items. Every new column is nullable and additive; no existing row
-- changes meaning. Explicit mapping only — nothing here infers a service
-- from freeform text at read/billing time (see CLAUDE.md "Billing
-- integration — Phase 7").
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

-- Consultation fee: PREFERRED path becomes tariff-backed (a doctor picks a
-- CONSULTATION-type Service; the server computes fee from its current
-- tariff, never trusting a client-supplied final amount in that case).
-- The pre-existing manual-fee path remains fully intact as the explicit
-- override — recorded, not silent: `fee_source` makes every row say
-- which path priced it, without a separate audit table.
ALTER TABLE consultations
  ADD COLUMN service_id     BIGINT UNSIGNED NULL AFTER fee,
  ADD COLUMN tariff_id      BIGINT UNSIGNED NULL AFTER service_id,
  ADD COLUMN taxable_amount DECIMAL(12, 2) NULL AFTER tariff_id,
  ADD COLUMN tax_rate       DECIMAL(5, 2) NULL AFTER taxable_amount,
  ADD COLUMN cgst_amount    DECIMAL(12, 2) NULL AFTER tax_rate,
  ADD COLUMN sgst_amount    DECIMAL(12, 2) NULL AFTER cgst_amount,
  ADD COLUMN igst_amount    DECIMAL(12, 2) NULL AFTER sgst_amount,
  ADD COLUMN tax_amount     DECIMAL(12, 2) NULL AFTER igst_amount,
  ADD COLUMN fee_source     ENUM('MANUAL', 'TARIFF') NOT NULL DEFAULT 'MANUAL' AFTER tax_amount,
  ADD KEY idx_consultations_service (service_id),
  ADD KEY idx_consultations_tariff (tariff_id),
  ADD CONSTRAINT fk_consultations_service FOREIGN KEY (service_id)
    REFERENCES services(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_consultations_tariff FOREIGN KEY (tariff_id)
    REFERENCES tariffs(id) ON DELETE SET NULL;

-- Pharmacy: explicit product identifier for pricing, layered on top of the
-- existing medicine_name/FEFO-by-name mechanism (UNCHANGED — this column
-- is never read by the dispense/FEFO query, only by billing). NULL means
-- "no catalog mapping yet" — dispensing and prescribing both continue to
-- work exactly as before; billing falls back to today's manual ₹0 pricing
-- for those items.
ALTER TABLE prescription_items
  ADD COLUMN service_id BIGINT UNSIGNED NULL AFTER medicine_name,
  ADD KEY idx_presc_items_service (service_id),
  ADD CONSTRAINT fk_presc_items_service FOREIGN KEY (service_id)
    REFERENCES services(id) ON DELETE SET NULL;

-- Lab: a lab_order already bundles 1-50 freeform test names (`tests`
-- JSON). Per-test explicit mapping needs its own row, not a single column
-- on lab_orders — `lab_order_items` is purely additive: created only for
-- tests the ordering clinician explicitly picked from a LAB-type Service
-- Master entry (never inferred from the freeform `tests` text at billing
-- time). An order with zero rows here behaves exactly as before Phase 7.
CREATE TABLE IF NOT EXISTS lab_order_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  lab_order_id BIGINT UNSIGNED NOT NULL,
  service_id   BIGINT UNSIGNED NULL,
  test_name    VARCHAR(191) NOT NULL,
  quantity     DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_lab_order_items_tenant (tenant_id),
  KEY idx_lab_order_items_order (lab_order_id),
  KEY idx_lab_order_items_service (service_id),
  CONSTRAINT fk_lab_order_items_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_order_items_order FOREIGN KEY (lab_order_id)
    REFERENCES lab_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_order_items_service FOREIGN KEY (service_id)
    REFERENCES services(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IPD room charge: the existing beds.daily_rate mechanism (working, tested,
-- used by billingEvents.js's admission:discharged listener) stays the
-- default for every existing bed. A bed can now optionally be linked to a
-- ROOM-type Service so its room charge is tariff-priced (with proper
-- tax/GST) instead — same "tariff preferred, manual value remains a valid
-- explicit fallback" shape as consultations.fee above.
ALTER TABLE beds
  ADD COLUMN service_id BIGINT UNSIGNED NULL AFTER daily_rate,
  ADD KEY idx_beds_service (service_id),
  ADD CONSTRAINT fk_beds_service FOREIGN KEY (service_id)
    REFERENCES services(id) ON DELETE SET NULL;
