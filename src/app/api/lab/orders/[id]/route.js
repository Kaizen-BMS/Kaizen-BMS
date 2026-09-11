import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Full detail for one order — the lab tech's working screen.
export const GET = apiRoute("lab:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const withJoins = await tenantDb.lab_orders.findUnique({
    where: { id: BigInt(id) },
    include: {
      patients: { select: { name: true, age: true, gender: true, allergies: true } },
      consultations: { select: { users: { select: { name: true } } } },
    },
  });
  if (!withJoins) return json({ error: "not_found" }, 404);
  const { patients: p, consultations: c, ...rest } = withJoins;
  const order = {
    ...rest,
    patient_name: p.name,
    patient_age: p.age,
    patient_gender: p.gender,
    patient_allergies: p.allergies,
    referring_doctor: c.users.name,
  };
  return json({ order });
});
