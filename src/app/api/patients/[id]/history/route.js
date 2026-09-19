import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

const parse = (v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

// A patient's full history at this facility: every visit, and — for staff who
// may see clinical data — what happened at each (diagnosis, medicines, lab
// tests) plus upcoming appointments. Tenant-scoped through tenantDb.
export const GET = apiRoute(null, async (_request, { session, params }) => {
  const clinical = can(session.role, "consultation:read");
  if (!clinical && !can(session.role, "patient:read")) throw new HttpError(403, "forbidden");
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "patient_not_found");
  const patientId = BigInt(id);

  const patient = await tenantDb.patients.findUnique({ where: { id: patientId }, select: { id: true, name: true, age: true, gender: true, phone: true } });
  if (!patient) throw new HttpError(404, "patient_not_found");

  const visits = await tenantDb.visits.findMany({
    where: { patient_id: patientId },
    orderBy: { created_at: "desc" },
    take: 100,
    select: { id: true, entry_type: true, status: true, reason: true, created_at: true },
  });
  const upcoming = await tenantDb.appointments.findMany({
    where: { patient_id: patientId, slot_time: { gte: new Date() }, status: { not: "CANCELLED" } },
    orderBy: { slot_time: "asc" },
    take: 10,
    select: { id: true, slot_time: true, status: true, reason: true },
  });

  let byVisit = new Map();
  if (clinical && visits.length) {
    const vids = visits.map((v) => v.id);
    const [cons, rx, labs, rad] = await Promise.all([
      tenantDb.consultations.findMany({ where: { visit_id: { in: vids } }, select: { visit_id: true, diagnosis: true, notes: true, fee: true } }),
      tenantDb.prescriptions.findMany({ where: { visit_id: { in: vids } }, include: { prescription_items: { select: { medicine_name: true, dosage: true, quantity: true, status: true } } } }),
      tenantDb.lab_orders.findMany({ where: { visit_id: { in: vids } }, select: { visit_id: true, tests: true, status: true, results: true } }),
      tenantDb.radiology_orders.findMany({ where: { visit_id: { in: vids } }, select: { visit_id: true, study_name: true, status: true, impression: true } }),
    ]);
    const get = (id) => byVisit.get(String(id)) || byVisit.set(String(id), { diagnosis: null, notes: null, medicines: [], labTests: [], radiology: [] }).get(String(id));
    cons.forEach((c) => Object.assign(get(c.visit_id), { diagnosis: c.diagnosis, notes: c.notes }));
    rx.forEach((p) => get(p.visit_id).medicines.push(...p.prescription_items.map((i) => ({ name: i.medicine_name, dosage: i.dosage, quantity: i.quantity, status: i.status }))));
    labs.forEach((l) => get(l.visit_id).labTests.push({ tests: parse(l.tests), status: l.status, results: parse(l.results) }));
    rad.forEach((r) => get(r.visit_id).radiology.push({ study: r.study_name, status: r.status, impression: r.impression }));
  }

  return json({
    patient: { ...patient, id: Number(patient.id) },
    totalVisits: visits.length,
    clinical,
    visits: visits.map((v) => ({
      id: Number(v.id),
      date: v.created_at,
      type: v.entry_type,
      status: v.status,
      reason: v.reason,
      ...(clinical ? byVisit.get(String(v.id)) || { diagnosis: null, notes: null, medicines: [], labTests: [], radiology: [] } : {}),
    })),
    upcomingAppointments: upcoming.map((a) => ({ id: Number(a.id), at: a.slot_time, status: a.status, reason: a.reason })),
  });
});
