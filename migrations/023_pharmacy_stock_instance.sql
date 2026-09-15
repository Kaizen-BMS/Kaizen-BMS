-- Scopes pharmacy_stock (and, transitively through it, FEFO dispensing) to
-- a specific PHARMACY module_instance, so "Main Pharmacy" and "Emergency
-- Pharmacy" can hold genuinely separate stock for the same medicine/batch
-- rather than sharing one tenant-wide pool. Column is nullable so this is
-- additive: every existing row gets backfilled to its tenant's single
-- default Pharmacy instance below, in the same migration, so no existing
-- stock row is ever left unattributed.
--
-- pharmacy_stock_movements and pharmacy_thresholds are deliberately left
-- untouched in this pass: movements are already scoped transitively
-- through stock_id -> pharmacy_stock (same pattern already used for
-- bill_items -> bills), and thresholds stay tenant-wide by design (a
-- low-stock alert level for a medicine name is a reasonable thing to
-- share across a tenant's pharmacy instances rather than configure N
-- times) — a deliberate scope decision, not an oversight.
ALTER TABLE pharmacy_stock
  ADD COLUMN module_instance_id BIGINT UNSIGNED NULL AFTER tenant_id,
  ADD CONSTRAINT fk_pharmacy_stock_instance FOREIGN KEY (module_instance_id) REFERENCES module_instances(id);

UPDATE pharmacy_stock ps
  JOIN module_instances mi
    ON mi.tenant_id = ps.tenant_id
   AND mi.module_name = 'PHARMACY'
   AND mi.is_default = 1
SET ps.module_instance_id = mi.id
WHERE ps.module_instance_id IS NULL;

-- Replace the old (tenant, medicine, batch) uniqueness with one that also
-- distinguishes by instance — two instances may legitimately stock an
-- identical medicine name + batch number as two separate physical
-- batches. Every existing row already has exactly one row per
-- (tenant, medicine, batch), so re-keying with module_instance_id added
-- (now non-NULL for all of them, per the backfill above) cannot introduce
-- a collision.
ALTER TABLE pharmacy_stock
  DROP INDEX uq_pharmacy_stock_batch,
  ADD UNIQUE KEY uq_pharmacy_stock_instance_batch (tenant_id, module_instance_id, medicine_name, batch_number),
  ADD INDEX idx_pharmacy_stock_instance (module_instance_id);
