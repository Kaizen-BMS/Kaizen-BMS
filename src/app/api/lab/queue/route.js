import { apiRoute, json } from "@/lib/apiRoute";
import { scopedQuery } from "@/lib/repo/tenant";

export const dynamic = "force-dynamic";

// Orders still awaiting collection/results, oldest first.
export const GET = apiRoute("lab:read", async () => {
  const orders = await scopedQuery(
    `SELECT lo.id, lo.status, lo.tests, lo.created_at, lo.collected_at, lo.received_at,
            lo.patient_id, p.name AS patient_name, p.age AS patient_age, p.allergies AS patient_allergies,
            u.name AS referring_doctor
       FROM lab_orders lo
       JOIN patients p ON p.id = lo.patient_id
       JOIN consultations c ON c.id = lo.consultation_id
       JOIN users u ON u.id = c.doctor_id
      WHERE lo.tenant_id = :tid
        AND lo.status IN ('ORDERED', 'IN_PROGRESS')
      ORDER BY lo.created_at ASC`,
  );
  return json({ orders });
});
