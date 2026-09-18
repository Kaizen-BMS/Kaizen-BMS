"use strict";

/**
 * Generic external-id mapping — Kaizen entity <-> a specific provider's
 * own id for the same real-world thing. Always written explicitly at the
 * moment a mapping is first established (order creation / first webhook
 * matching a known internal reference) — never inferred or fuzzy-matched,
 * the same discipline Phase 7 established for medicine/lab-test mapping.
 */
function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

async function mapExternalId(db, { tenantId, providerId, entityType, internalId, externalId }) {
  // Prisma's generated compound-unique input field name is the default
  // snake_case column concatenation (tenant_id_provider_id_entity_type_
  // internal_id) — the migration's `map:` name only renames the actual SQL
  // index, it does not become the JS field name unless the schema also
  // declares an explicit `name:` on `@@unique` (introspection via
  // `db pull` never adds one). Confirmed directly against a live
  // PrismaClientValidationError before this fix, not assumed.
  return db.external_identifiers.upsert({
    where: {
      tenant_id_provider_id_entity_type_internal_id: { tenant_id: toId(tenantId), provider_id: toId(providerId), entity_type: entityType, internal_id: toId(internalId) },
    },
    update: { external_id: String(externalId) },
    create: { tenant_id: toId(tenantId), provider_id: toId(providerId), entity_type: entityType, internal_id: toId(internalId), external_id: String(externalId) },
  });
}

async function resolveInternalId(db, { tenantId, providerId, entityType, externalId }) {
  const row = await db.external_identifiers.findFirst({
    where: { tenant_id: toId(tenantId), provider_id: toId(providerId), entity_type: entityType, external_id: String(externalId) },
  });
  return row ? Number(row.internal_id) : null;
}

async function resolveExternalId(db, { tenantId, providerId, entityType, internalId }) {
  const row = await db.external_identifiers.findFirst({
    where: { tenant_id: toId(tenantId), provider_id: toId(providerId), entity_type: entityType, internal_id: toId(internalId) },
  });
  return row ? row.external_id : null;
}

module.exports = { mapExternalId, resolveInternalId, resolveExternalId };
