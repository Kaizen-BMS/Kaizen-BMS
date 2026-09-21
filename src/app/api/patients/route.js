import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

const SORTS = {
  name: "p.name",
  age: "p.age",
  registered: "p.created_at",
  visits: "visits",
  lastVisit: "last_visit",
};

// Every patient of this facility with how many times they came and when they
// last did — sortable and searchable. Sort column comes from a fixed list.
export const GET = apiRoute("patient:read", async (request) => {
  const sp = new URL(request.url).searchParams;
  const tid = BigInt(requireTenantId());
  const q = (sp.get("q") || "").trim().slice(0, 100);
  const sortKey = SORTS[sp.get("sort")] ? sp.get("sort") : "registered";
  const dir = sp.get("dir") === "asc" ? "ASC" : "DESC";
  const pageSize = Math.min(Math.max(Number(sp.get("pageSize")) || 25, 5), 100);
  const page = Math.max(Number(sp.get("page")) || 1, 1);

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const where = q ? "AND (p.name LIKE ? OR p.phone LIKE ?)" : "";
  const args = q ? [like, like] : [];

  const [rows, count] = await Promise.all([
    tenantDb.$queryRawUnsafe(
      `SELECT p.id, p.name, p.age, p.gender, p.phone, p.created_at,
              COUNT(v.id) AS visits, MAX(v.created_at) AS last_visit
         FROM patients p LEFT JOIN visits v ON v.patient_id = p.id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? ${where}
        GROUP BY p.id, p.name, p.age, p.gender, p.phone, p.created_at
        ORDER BY ${SORTS[sortKey]} ${dir}, p.id DESC
        LIMIT ? OFFSET ?`,
      tid,
      ...args,
      pageSize,
      (page - 1) * pageSize,
    ),
    tenantDb.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM patients p WHERE p.tenant_id = ? ${where}`, tid, ...args),
  ]);

  return json({
    total: Number(count[0]?.c || 0),
    page,
    pageSize,
    patients: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      age: r.age,
      gender: r.gender,
      phone: r.phone,
      registeredAt: r.created_at,
      visits: Number(r.visits),
      lastVisit: r.last_visit,
    })),
  });
});
