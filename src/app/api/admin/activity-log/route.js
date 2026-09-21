import { apiRoute, json } from "@/lib/apiRoute";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// The facility's activity log (admin / owner): who did what, when — across
// registration, doctors, pharmacy, lab, billing, staff and partners.
export const GET = apiRoute("staff:manage", async (request, { session }) => {
  const sp = new URL(request.url).searchParams;
  const where = { tenant_id: BigInt(session.tenantId) };
  const user = sp.get("userId");
  const feature = sp.get("feature");
  const from = sp.get("from");
  const to = sp.get("to");
  const before = sp.get("before");
  if (user && /^[0-9]{1,18}$/.test(user)) where.user_id = BigInt(user);
  if (feature && /^[a-z]{2,30}$/.test(feature)) where.feature = feature;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at.gte = new Date(`${from}T00:00:00`);
    if (to) where.created_at.lt = new Date(new Date(`${to}T00:00:00`).getTime() + 86400000);
  }
  if (before && /^[0-9]{1,18}$/.test(before)) where.id = { lt: BigInt(before) };

  const rows = await prisma.audit_logs.findMany({ where, orderBy: { id: "desc" }, take: 100 });
  const [people, areas] = await Promise.all([
    prisma.audit_logs.groupBy({ by: ["user_id", "user_name"], where: { tenant_id: BigInt(session.tenantId) } }),
    prisma.audit_logs.groupBy({ by: ["feature"], where: { tenant_id: BigInt(session.tenantId) } }),
  ]);
  return json({
    entries: rows.map((r) => ({ id: Number(r.id), at: r.created_at, person: r.user_name, role: r.user_role, area: r.feature, summary: r.summary })),
    hasMore: rows.length === 100,
    people: people.map((p) => ({ id: Number(p.user_id), name: p.user_name })).filter((p) => p.name),
    areas: areas.map((a) => a.feature).filter(Boolean),
  });
});
