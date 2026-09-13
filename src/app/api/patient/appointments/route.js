import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "APPOINTMENTS");
  if (!active) return json({ moduleActive: false, appointments: [] });

  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const rows = await tenantDb.appointments.findMany({
    where: { patient_id: { in: filter.ids } },
    include: { users: { select: { name: true } } },
    orderBy: { slot_time: "desc" },
  });

  const appointments = rows.map((a) => ({
    id: Number(a.id),
    slotTime: a.slot_time,
    status: a.status,
    reason: a.reason,
    doctorName: a.users.name,
  }));
  return json({ moduleActive: true, appointments });
});
