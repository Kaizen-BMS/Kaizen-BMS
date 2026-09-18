import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// Mirrors GET /api/patient/lab-reports exactly — only COMPLETED orders are
// shown (an in-progress order has nothing diagnostic for a patient yet).
export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "RADIOLOGY");
  if (!active) return json({ moduleActive: false, radiologyReports: [] });

  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const rows = await tenantDb.radiology_orders.findMany({
    where: { patient_id: { in: filter.ids }, status: "COMPLETED" },
    orderBy: { reported_at: "desc" },
  });

  const radiologyReports = rows.map((o) => ({
    id: Number(o.id),
    studyName: o.study_name,
    findings: o.findings,
    impression: o.impression,
    reportedAt: o.reported_at,
  }));
  return json({ moduleActive: true, radiologyReports });
});
