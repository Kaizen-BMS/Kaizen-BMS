"use strict";

/**
 * Owner / organization access. `tenants` stays the FACILITY layer; this file
 * is the thin ownership layer above it: an organization owns facilities, a
 * user who is an OWNER member of an organization may act in any facility of
 * it. A session's tenant id is always the ACTIVE facility — switching only
 * ever re-issues the session after a live ownership check, and every later
 * request from a switched session re-verifies that ownership (so revoking
 * ownership takes effect within seconds, not at token expiry).
 *
 * Raw `prisma` with explicit ids throughout: this runs before/outside any
 * tenant context by nature (it decides which tenant context to grant).
 */
const { prisma } = require("./prismaClient");

const CACHE_TTL_MS = 20_000;
const cache = new Map();

function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

async function ownedOrganizationIds(userId) {
  const rows = await prisma.organization_members.findMany({
    where: { user_id: toId(userId), role: "OWNER" },
    select: { organization_id: true },
  });
  if (rows.length === 0) return [];
  const orgs = await prisma.organizations.findMany({
    where: { id: { in: rows.map((r) => r.organization_id) }, active: true },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}

/** True if `userId` is an OWNER of the organization the tenant belongs to. */
async function ownsTenant(userId, tenantId) {
  const key = `${userId}:${tenantId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.ok;
  const tenant = await prisma.tenants.findUnique({ where: { id: toId(tenantId) }, select: { organization_id: true } });
  let ok = false;
  if (tenant?.organization_id != null) {
    const orgIds = await ownedOrganizationIds(userId);
    ok = orgIds.some((id) => id === tenant.organization_id);
  }
  cache.set(key, { ok, exp: Date.now() + CACHE_TTL_MS });
  return ok;
}

function clearAccessCache() {
  cache.clear();
}

async function userIsActive(userId) {
  const key = `active:${userId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.ok;
  const u = await prisma.users.findUnique({ where: { id: toId(userId) }, select: { active: true } });
  const ok = !!u && u.active !== false;
  cache.set(key, { ok, exp: Date.now() + CACHE_TTL_MS });
  return ok;
}

/** A session may act in its tenant if that is the user's home tenant, or the user currently owns it — and the login itself is still switched on. */
async function sessionFacilityOk(session) {
  if (!session) return true;
  if (session.userId != null && !(await userIsActive(session.userId))) return false;
  if (session.tenantId == null) return true;
  if (session.homeTenantId == null || session.homeTenantId === session.tenantId) return true;
  return ownsTenant(session.userId, session.tenantId);
}

/** Every facility this user may act in (owner memberships + their own home tenant), with real counts — nothing fabricated. */
async function listFacilitiesForUser(userId, activeTenantId) {
  const orgIds = await ownedOrganizationIds(userId);
  const home = await prisma.users.findUnique({ where: { id: toId(userId) }, select: { tenant_id: true } });
  const where = { OR: [{ organization_id: { in: orgIds } }] };
  if (home?.tenant_id != null) where.OR.push({ id: home.tenant_id });
  const tenants = await prisma.tenants.findMany({
    where,
    select: { id: true, name: true, type: true, active: true, owner_enabled: true, public_code: true, organization_id: true },
    orderBy: { id: "asc" },
  });
  if (tenants.length === 0) return [];
  const ids = tenants.map((t) => t.id);
  const [modules, internal, partner] = await Promise.all([
    prisma.tenant_modules.groupBy({ by: ["tenant_id"], where: { tenant_id: { in: ids }, is_active: true }, _count: { _all: true } }),
    prisma.module_connections.groupBy({ by: ["tenant_id"], where: { tenant_id: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
    prisma.org_connections.findMany({
      where: { status: "ACTIVE", OR: [{ requester_tenant_id: { in: ids } }, { receiver_tenant_id: { in: ids } }] },
      select: { requester_tenant_id: true, receiver_tenant_id: true },
    }),
  ]);
  const count = (rows, id) => Number(rows.find((r) => r.tenant_id === id)?._count._all || 0);
  const orgNames = new Map(
    (await prisma.organizations.findMany({ where: { id: { in: [...new Set(tenants.map((t) => t.organization_id).filter(Boolean))] } }, select: { id: true, name: true } })).map((o) => [String(o.id), o.name]),
  );
  return tenants.map((t) => ({
    id: Number(t.id),
    name: t.name,
    type: t.type,
    publicCode: t.public_code,
    organizationName: t.organization_id != null ? orgNames.get(String(t.organization_id)) || null : null,
    enabled: !!t.active && !!t.owner_enabled,
    platformSuspended: !t.active,
    current: activeTenantId != null && Number(t.id) === Number(activeTenantId),
    activeModules: count(modules, t.id),
    internalConnections: count(internal, t.id),
    partnerConnections: partner.filter((c) => c.requester_tenant_id === t.id || c.receiver_tenant_id === t.id).length,
    isOwner: t.organization_id != null && orgIds.some((o) => o === t.organization_id),
  }));
}

module.exports = { ownsTenant, sessionFacilityOk, listFacilitiesForUser, ownedOrganizationIds, clearAccessCache };
