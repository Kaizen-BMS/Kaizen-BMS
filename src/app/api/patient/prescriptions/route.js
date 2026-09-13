import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// Uses the same print-quality data (dosage carries frequency+duration
// together, e.g. "1-0-1 x 5 days") already built for prescription print —
// this just renders it on screen instead of a printed page.
export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "DOCTOR_OPD");
  if (!active) return json({ moduleActive: false, prescriptions: [] });

  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const rows = await tenantDb.prescriptions.findMany({
    where: { consultations: { patient_id: { in: filter.ids } } },
    include: {
      prescription_items: true,
      consultations: { select: { diagnosis: true, created_at: true, users: { select: { name: true } } } },
    },
    orderBy: { created_at: "desc" },
  });

  const prescriptions = rows.map((p) => ({
    id: Number(p.id),
    status: p.status,
    createdAt: p.created_at,
    diagnosis: p.consultations.diagnosis,
    doctorName: p.consultations.users.name,
    items: p.prescription_items.map((i) => ({
      medicineName: i.medicine_name,
      dosage: i.dosage,
      quantity: i.quantity,
    })),
  }));
  return json({ moduleActive: true, prescriptions });
});
