import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { billInfo } from "@/lib/labBills";

export const dynamic = "force-dynamic";

// Orders still awaiting collection/results, oldest first.
export const GET = apiRoute("lab:read", async () => {
  const rows = await tenantDb.lab_orders.findMany({
    where: { status: { in: ["ORDERED", "IN_PROGRESS"] } },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      status: true,
      tests: true,
      created_at: true,
      collected_at: true,
      received_at: true,
      patient_id: true,
      source: true,
      bill_id: true,
      referred_by: true,
      patients: { select: { name: true, age: true, allergies: true } },
      consultations: { select: { users: { select: { name: true } } } },
    },
  });

  const bills = await billInfo(rows.map((r) => r.bill_id));
  const orders = rows.map(({ patients: p, consultations: c, ...rest }) => ({
    bill: rest.bill_id ? bills.get(String(rest.bill_id)) || null : null,
    ...rest,
    patient_name: p.name,
    patient_age: p.age,
    patient_allergies: p.allergies,
    referring_doctor: c?.users?.name || rest.referred_by || null,
  }));

  return json({ orders });
});
