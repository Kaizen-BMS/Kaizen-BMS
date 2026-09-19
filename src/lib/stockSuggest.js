"use strict";

/**
 * "Is this medicine available?" hints for a doctor while prescribing. Only
 * names and a yes/no come back — never quantities, batches or prices.
 * Sources: the doctor's own facility pharmacy (on by default, can be turned
 * off in Settings) and connected partner pharmacies that have chosen to share.
 */
const { prisma } = require("./prismaClient");

async function matches(tenantId, q) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT medicine_name AS name,
            SUM(CASE WHEN expiry_date >= CURDATE() THEN quantity ELSE 0 END) AS qty
       FROM pharmacy_stock
      WHERE tenant_id = ? AND medicine_name LIKE ?
      GROUP BY medicine_name ORDER BY medicine_name LIMIT 8`,
    tenantId,
    `%${q.replace(/[%_]/g, "")}%`,
  );
  return rows.map((r) => ({ name: r.name, available: Number(r.qty) > 0 }));
}

async function suggest(tenantId, rawQuery) {
  const q = String(rawQuery || "").trim();
  if (q.length < 2) return { sources: [] };
  const sources = [];

  const me = await prisma.tenants.findUnique({ where: { id: BigInt(tenantId) }, select: { show_stock_to_doctors: true } });
  const hasPharmacy = await prisma.tenant_modules.findFirst({ where: { tenant_id: BigInt(tenantId), module_name: "PHARMACY", is_active: true }, select: { id: true } });
  if (hasPharmacy && me?.show_stock_to_doctors) {
    sources.push({ label: "Our pharmacy", matches: await matches(BigInt(tenantId), q) });
  }

  const partners = await prisma.org_connections.findMany({
    where: { requester_tenant_id: BigInt(tenantId), service_type: "PHARMACY", status: "ACTIVE", share_stock: true },
    select: { receiver_tenant_id: true },
  });
  if (partners.length) {
    const tenants = await prisma.tenants.findMany({ where: { id: { in: partners.map((p) => p.receiver_tenant_id) } }, select: { id: true, name: true } });
    for (const t of tenants) sources.push({ label: t.name, matches: await matches(t.id, q) });
  }
  return { sources };
}

module.exports = { suggest };
