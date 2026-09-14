-- 017_appointment_enhancements.sql — section 3 of the Appointment work:
-- receptionist manual token override (audit trail) + doctor-initiated
-- follow-up scheduling (no new schema needed there — it reuses the
-- appointments/doctor_slots tables from migration 016 as-is).
--
-- Applied via the automatic backup-then-apply flow (npm run db:migrate).

-- A manual token-number override bypasses normal queue fairness (a
-- priority/emergency walk-in, or correcting a numbering mistake), so it
-- needs to be accountable, not silent — same authorized_by + reason
-- audit-trail shape already used for Billing discounts.
CREATE TABLE IF NOT EXISTS token_overrides (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  visit_id       BIGINT UNSIGNED NOT NULL,
  token_number   INT UNSIGNED NOT NULL,
  reason         VARCHAR(255) NOT NULL,
  overridden_by  BIGINT UNSIGNED NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_token_overrides_tenant (tenant_id),
  KEY idx_token_overrides_visit (visit_id),
  CONSTRAINT fk_token_overrides_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_token_overrides_visit FOREIGN KEY (visit_id)
    REFERENCES visits(id) ON DELETE CASCADE,
  CONSTRAINT fk_token_overrides_by FOREIGN KEY (overridden_by)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
