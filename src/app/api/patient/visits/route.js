import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// Completed visits eligible for feedback — DISCHARGED is the terminal
// status for both a plain OPD visit and an IPD stay (see CLAUDE.md "Patient
// journey model"). Flags whether feedback was already submitted so the UI
// can hide the form rather than let a second submit attempt hit the
// once-per-visit unique constraint.
export const GET = patientApiRoute(async (request, { session }) => {
  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const rows = await tenantDb.visits.findMany({
    where: { patient_id: { in: filter.ids }, status: "DISCHARGED" },
    include: { feedback: { select: { id: true } } },
    orderBy: { discharged_at: "desc" },
  });

  const visits = rows.map((v) => ({
    id: Number(v.id),
    entryType: v.entry_type,
    dischargedAt: v.discharged_at,
    hasFeedback: v.feedback.length > 0,
  }));
  return json({ visits });
});
