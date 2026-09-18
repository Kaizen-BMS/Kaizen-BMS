-- Real Vendor Integration Readiness.
--
-- Widens external_providers' uniqueness from (tenant_id, provider_code) to
-- (tenant_id, provider_code, environment). Today a tenant can only ever
-- register ONE row per provider_code — which makes it impossible to hold a
-- SANDBOX and a PRODUCTION configuration for the same real vendor at the
-- same time (two genuinely separate base URLs, credentials, and health/
-- order history, the way every real integration is actually tested before
-- being promoted). Each environment becomes its own external_providers row
-- (its own external_credentials row too, via the existing 1:1 relation) —
-- never a single row that silently switches environment in place, which
-- would blend sandbox and production order/webhook history together and
-- risk an accidental production call from a sandbox-configured connection.
--
-- Safe/additive: every existing provider row already has a distinct
-- (tenant_id, provider_code) pair, so widening the key cannot collide with
-- itself; DROP + ADD on the same columns plus environment is the only way
-- to change a UNIQUE KEY's column list in MariaDB (no ALTER ... RENAME
-- COLUMN-style widen exists for indexes).
ALTER TABLE external_providers
  DROP INDEX uq_external_providers_tenant_code,
  ADD UNIQUE KEY uq_external_providers_tenant_code_env (tenant_id, provider_code, environment);
