import { apiRoute, json } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { scopedQuery } from "@/lib/repo/tenant";

export const dynamic = "force-dynamic";

// Tenant-scoped global search for the topbar. Patient results only for roles
// that can act on a patient at the front desk; every role still gets the
// nav-item matches, which the client computes locally.
export const GET = apiRoute("patient:read", async (request, { session }) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2 || session.tenantId == null) return json({ patients: [] });

  let patients = [];
  if (can(session.role, "visit:create")) {
    const rows = await scopedQuery(
      `SELECT id, name, age, phone FROM patients
        WHERE tenant_id = :tid AND (name LIKE :like OR phone LIKE :like)
        ORDER BY created_at DESC LIMIT 8`,
      { like: `%${q}%` },
    );
    patients = rows.map((p) => ({
      id: p.id,
      label: p.name,
      sub: `${p.age ?? "?"}y · ${p.phone}`,
      href: `/dashboard/registration?patient=${p.id}`,
    }));
  }

  return json({ patients });
});
