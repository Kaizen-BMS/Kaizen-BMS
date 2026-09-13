import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// "Active medications" = the items on the patient's single most recent
// prescription. There's no structured expiry/duration anywhere in this
// schema (dosage is freeform text like "1-0-1 x 5 days", not machine-
// parseable into an end date), so "most recent prescription's items" is
// the honest, simple interpretation rather than pretending to compute a
// real still-taking-it/expired distinction this data can't support.
export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "DOCTOR_OPD");
  if (!active) return json({ moduleActive: false, medications: [] });

  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const latest = await tenantDb.prescriptions.findFirst({
    where: { consultations: { patient_id: { in: filter.ids } }, status: { not: "CANCELLED" } },
    include: { prescription_items: true, consultations: { select: { created_at: true } } },
    orderBy: { created_at: "desc" },
  });

  if (!latest) return json({ moduleActive: true, prescribedAt: null, medications: [] });

  return json({
    moduleActive: true,
    prescribedAt: latest.created_at,
    medications: latest.prescription_items.map((i) => ({
      medicineName: i.medicine_name,
      dosage: i.dosage,
    })),
  });
});
