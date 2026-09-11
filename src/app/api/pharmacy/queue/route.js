import { apiRoute, json } from "@/lib/apiRoute";
import { scopedQuery } from "@/lib/repo/tenant";

export const dynamic = "force-dynamic";

// Prescriptions still needing (full or partial) dispensing, oldest first.
export const GET = apiRoute("prescription:read", async () => {
  const prescriptions = await scopedQuery(
    `SELECT pr.id, pr.status, pr.notes, pr.created_at,
            p.id AS patient_id, p.name AS patient_name, p.allergies AS patient_allergies
       FROM prescriptions pr
       JOIN visits v ON v.id = pr.visit_id
       JOIN patients p ON p.id = v.patient_id
      WHERE pr.tenant_id = :tid
        AND pr.status IN ('PENDING', 'PARTIALLY_FULFILLED')
      ORDER BY pr.created_at ASC`,
  );
  for (const pr of prescriptions) {
    pr.items = await scopedQuery(
      `SELECT * FROM prescription_items
        WHERE tenant_id = :tid AND prescription_id = :pid
        ORDER BY id ASC`,
      { pid: pr.id },
    );
  }
  return json({ prescriptions });
});
