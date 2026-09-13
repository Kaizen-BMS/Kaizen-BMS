import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "IPD");
  if (!active) return json({ moduleActive: false, dischargeSummaries: [] });

  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const rows = await tenantDb.admissions.findMany({
    where: { discharged_at: { not: null }, visits: { patient_id: { in: filter.ids } } },
    include: { beds: { select: { ward_type: true, bed_number: true } } },
    orderBy: { discharged_at: "desc" },
  });

  const dischargeSummaries = rows.map((a) => ({
    id: Number(a.id),
    admittedAt: a.admitted_at,
    dischargedAt: a.discharged_at,
    dischargeType: a.discharge_type,
    dischargeNotes: a.discharge_notes,
    ward: a.beds.ward_type,
    bedNumber: a.beds.bed_number,
  }));
  return json({ moduleActive: true, dischargeSummaries });
});
