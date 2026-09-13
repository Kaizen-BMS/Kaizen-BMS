import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// Only RESULTED orders are shown — an in-progress order has nothing
// diagnostic to show a patient yet, and NOT_REQUIRED/CANCELLED aren't
// reports at all.
export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "LAB");
  if (!active) return json({ moduleActive: false, labReports: [] });

  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const rows = await tenantDb.lab_orders.findMany({
    where: { patient_id: { in: filter.ids }, status: "RESULTED" },
    orderBy: { resulted_at: "desc" },
  });

  const parseJson = (v, fallback) => {
    if (typeof v !== "string") return v ?? fallback;
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  };
  const labReports = rows.map((o) => ({
    id: Number(o.id),
    tests: parseJson(o.tests, []),
    results: parseJson(o.results, []),
    resultedAt: o.resulted_at,
  }));
  return json({ moduleActive: true, labReports });
});
