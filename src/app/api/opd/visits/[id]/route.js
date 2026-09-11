import { apiRoute, json } from "@/lib/apiRoute";
import { scopedQuery, scopedQueryOne } from "@/lib/repo/tenant";

export const dynamic = "force-dynamic";

// Everything the consultation screen needs for one visit.
export const GET = apiRoute("consultation:read", async (request, ctx) => {
  const { id } = await ctx.params;
  const visitId = Number(id);

  const visit = await scopedQueryOne(
    `SELECT v.*, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone,
            p.custom_fields AS patient_custom_fields, p.allergies AS patient_allergies,
            p.abha_id AS patient_abha_id
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = :tid AND v.id = :id`,
    { id: visitId },
  );
  if (!visit) return json({ error: "not_found" }, 404);

  const consultation = await scopedQueryOne(
    `SELECT * FROM consultations
      WHERE tenant_id = :tid AND visit_id = :id
      ORDER BY id DESC LIMIT 1`,
    { id: visitId },
  );

  let prescriptions = [];
  let labOrders = [];
  if (consultation) {
    prescriptions = await scopedQuery(
      `SELECT * FROM prescriptions
        WHERE tenant_id = :tid AND consultation_id = :cid
        ORDER BY id ASC`,
      { cid: consultation.id },
    );
    for (const p of prescriptions) {
      p.items = await scopedQuery(
        `SELECT * FROM prescription_items
          WHERE tenant_id = :tid AND prescription_id = :pid
          ORDER BY id ASC`,
        { pid: p.id },
      );
    }
    labOrders = await scopedQuery(
      `SELECT * FROM lab_orders
        WHERE tenant_id = :tid AND consultation_id = :cid
        ORDER BY id ASC`,
      { cid: consultation.id },
    );
  }

  return json({ visit, consultation, prescriptions, labOrders });
});
