import { apiRoute, json } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Tenant-scoped global search for the topbar. Patient results only for roles
// that can act on a patient at the front desk; every role still gets the
// nav-item matches, which the client computes locally.
export const GET = apiRoute("patient:read", async (request, { session }) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2 || session.tenantId == null) return json({ patients: [] });

  let patients = [];
  if (can(session.role, "visit:create")) {
    const rows = await tenantDb.patients.findMany({
      where: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
      select: { id: true, name: true, age: true, phone: true },
      orderBy: { created_at: "desc" },
      take: 8,
    });
    patients = rows.map((p) => ({
      id: p.id,
      label: p.name,
      sub: `${p.age ?? "?"}y · ${p.phone}`,
      href: `/dashboard/registration?patient=${p.id}`,
    }));
  }

  return json({ patients });
});
