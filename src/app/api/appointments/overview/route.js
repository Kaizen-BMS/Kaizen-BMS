import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb, prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// How many appointments each day has, and for which doctor — for the next N
// days (the "what's coming up" strip on the Today's appointments page).
export const GET = apiRoute("appointment:read", async (request, { session }) => {
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from") || new Date().toISOString().slice(0, 10);
  const days = Math.min(Math.max(Number(sp.get("days")) || 14, 1), 60);
  const start = new Date(`${from}T00:00:00`);
  if (Number.isNaN(start.getTime())) return json({ error: "invalid_date" }, 400);
  const end = new Date(start.getTime() + days * 86400000);
  const own = session.role === "DOCTOR" || session.role === "OWNER_DOCTOR";

  const rows = await tenantDb.appointments.findMany({
    where: { slot_time: { gte: start, lt: end }, status: { in: ["BOOKED", "CONFIRMED", "COMPLETED"] }, ...(own ? { doctor_user_id: BigInt(session.userId) } : {}) },
    select: { slot_time: true, doctor_user_id: true },
  });
  const users = rows.length ? await prisma.users.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.doctor_user_id))] } }, select: { id: true, name: true } }) : [];
  const name = new Map(users.map((u) => [String(u.id), u.name]));

  const byDay = new Map();
  for (const r of rows) {
    const key = r.slot_time.toISOString().slice(0, 10);
    const d = byDay.get(key) || { date: key, total: 0, doctors: new Map() };
    d.total++;
    const dn = name.get(String(r.doctor_user_id)) || "Doctor";
    d.doctors.set(dn, (d.doctors.get(dn) || 0) + 1);
    byDay.set(key, d);
  }
  const out = [];
  for (let i = 0; i < days; i++) {
    const key = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    const d = byDay.get(key);
    out.push({ date: key, total: d?.total || 0, doctors: d ? [...d.doctors].map(([n, c]) => ({ name: n, count: c })) : [] });
  }
  return json({ days: out });
});
