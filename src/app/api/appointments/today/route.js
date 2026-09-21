import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb, prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

const num = (v) => (v == null ? null : Number(v));

// Today's appointments with everything the front desk needs about each
// patient (details, allergies, payment category, visits so far), whether they
// have arrived (a visit + token today) and whether the consultation fee is paid.
export const GET = apiRoute("appointment:read", async (request, { session }) => {
  const date = new URL(request.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const day = new Date(`${date}T00:00:00`);
  if (Number.isNaN(day.getTime())) return json({ error: "invalid_date" }, 400);
  const next = new Date(day.getTime() + 86400000);

  const own = session.role === "DOCTOR" || session.role === "OWNER_DOCTOR";
  const appts = await tenantDb.appointments.findMany({
    where: { slot_time: { gte: day, lt: next }, status: { not: "CANCELLED" }, ...(own ? { doctor_user_id: BigInt(session.userId) } : {}) },
    orderBy: { slot_time: "asc" },
    include: { patients: true },
  });
  if (appts.length === 0) return json({ date, appointments: [] });

  const patientIds = [...new Set(appts.map((a) => a.patient_id))];
  const [doctors, visits, insurance, counts] = await Promise.all([
    prisma.users.findMany({ where: { id: { in: [...new Set(appts.map((a) => a.doctor_user_id))] } }, select: { id: true, name: true } }),
    tenantDb.visits.findMany({ where: { patient_id: { in: patientIds }, created_at: { gte: day, lt: next } }, orderBy: { id: "desc" }, select: { id: true, patient_id: true, token_number: true, status: true } }),
    tenantDb.patient_insurance.findMany({ where: { patient_id: { in: patientIds } }, select: { patient_id: true, payment_category: true, insurance_available: true } }),
    tenantDb.visits.groupBy({ by: ["patient_id"], where: { patient_id: { in: patientIds } }, _count: { _all: true } }),
  ]);
  const visitIds = visits.map((v) => v.id);
  const bills = visitIds.length
    ? await tenantDb.bills.findMany({ where: { visit_id: { in: visitIds }, bill_type: "OPD" }, include: { payments: { select: { amount: true } } } })
    : [];

  const dmap = new Map(doctors.map((d) => [String(d.id), d.name]));
  const vmap = new Map();
  visits.forEach((v) => { if (!vmap.has(String(v.patient_id))) vmap.set(String(v.patient_id), v); });
  const imap = new Map(insurance.map((i) => [String(i.patient_id), i]));
  const cmap = new Map(counts.map((c) => [String(c.patient_id), c._count._all]));
  const bmap = new Map(bills.map((b) => [String(b.visit_id), b]));

  return json({
    date,
    appointments: appts.map((a) => {
      const p = a.patients;
      const v = vmap.get(String(a.patient_id)) || null;
      const b = v ? bmap.get(String(v.id)) : null;
      const ins = imap.get(String(a.patient_id));
      let allergies = [];
      try { allergies = p.allergies ? JSON.parse(p.allergies) : []; } catch { /* ignore */ }
      return {
        id: Number(a.id),
        slotTime: a.slot_time,
        status: a.status,
        reason: a.reason,
        bookedBy: a.booked_by,
        doctor: dmap.get(String(a.doctor_user_id)) || null,
        patient: {
          id: Number(p.id), name: p.name, age: p.age, gender: p.gender, phone: p.phone, email: p.email,
          allergies, abhaId: p.abha_id, paymentCategory: ins?.payment_category || "SELF_PAY", hasInsurance: !!ins?.insurance_available,
          visitsSoFar: cmap.get(String(a.patient_id)) || 0,
        },
        visit: v ? { id: Number(v.id), token: v.token_number, status: v.status } : null,
        fee: b ? { billId: Number(b.id), total: num(b.total_amount), paid: b.payments.reduce((s, x) => s + Number(x.amount), 0), status: b.status } : null,
      };
    }),
  });
});
