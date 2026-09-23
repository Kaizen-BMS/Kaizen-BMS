import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { billInfo } from "@/lib/labBills";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(191).optional(),
});

// Finished reports and where each one goes: to the ordering doctor's screen
// (doctor-ordered) or to be printed and handed over (walk-in / outside doctor).
// ?q= looks an OLD bill/report up by patient name, phone, or order id — not
// capped to the recent-60 default, so it can actually find something from
// weeks ago.
export const GET = apiRoute("lab:read", async (request) => {
  const { q } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const where = { status: "RESULTED" };
  if (q) {
    const asId = /^\d+$/.test(q) ? BigInt(q) : null;
    where.OR = [
      { patients: { name: { contains: q } } },
      { patients: { phone: { contains: q } } },
      ...(asId ? [{ id: asId }] : []),
    ];
  }
  const rows = await tenantDb.lab_orders.findMany({
    where,
    orderBy: { resulted_at: "desc" },
    take: q ? 100 : 60,
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
