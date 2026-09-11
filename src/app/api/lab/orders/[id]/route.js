import { apiRoute, json } from "@/lib/apiRoute";
import { scopedQueryOne } from "@/lib/repo/tenant";

export const dynamic = "force-dynamic";

// Full detail for one order — the lab tech's working screen.
export const GET = apiRoute("lab:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const order = await scopedQueryOne(
    `SELECT lo.*, p.name AS patient_name, p.age AS patient_age, p.gender AS patient_gender,
            p.allergies AS patient_allergies, u.name AS referring_doctor
       FROM lab_orders lo
       JOIN patients p ON p.id = lo.patient_id
       JOIN consultations c ON c.id = lo.consultation_id
       JOIN users u ON u.id = c.doctor_id
      WHERE lo.tenant_id = :tid AND lo.id = :id`,
    { id: Number(id) },
  );
  if (!order) return json({ error: "not_found" }, 404);
  return json({ order });
});
