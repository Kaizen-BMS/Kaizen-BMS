import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { billInfo } from "@/lib/labBills";

export const dynamic = "force-dynamic";

// Finished reports and where each one goes: to the ordering doctor's screen
// (doctor-ordered) or to be printed and handed over (walk-in / outside doctor).
export const GET = apiRoute("lab:read", async () => {
  const rows = await tenantDb.lab_orders.findMany({
    where: { status: "RESULTED" },
    orderBy: { resulted_at: "desc" },
    take: 60,
    include: { patients: { select: { name: true, phone: true } }, consultations: { select: { users: { select: { name: true } } } } },
  });
  const bm = await billInfo(rows.map((r) => r.bill_id));
  const reports = rows.map((r) => {
    const doctor = r.consultations?.users?.name || null;
    const bill = r.bill_id ? bm.get(String(r.bill_id)) : null;
    let tests = [];
    try { tests = JSON.parse(r.tests); } catch { /* keep empty */ }
    return {
      id: Number(r.id), patient: r.patients.name, phone: r.patients.phone, tests, resultedAt: r.resulted_at,
      source: r.source, doctor, referredBy: r.referred_by,
      delivery: doctor ? `Sent to Dr. ${doctor}` : "Print and hand over",
      bill: bill || null,
    };
  });
  return json({ reports });
});
