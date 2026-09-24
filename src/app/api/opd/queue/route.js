import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

// The doctor's queue: today's visits not yet through billing/discharge,
// with a flag for whether a consultation has been started.
export const GET = apiRoute("consultation:read", async (_request, { session }) => {
  const tid = requireTenantId();
  // A doctor sees the patients registered for them, plus those not assigned to anyone.
  const isDoctor = session.role === "DOCTOR";
  const mine = isDoctor ? "AND (v.doctor_id = ? OR v.doctor_id IS NULL)" : "";
  const mineArgs = isDoctor ? [BigInt(session.userId)] : [];
  const visits = await tenantDb.$queryRawUnsafe(
    `SELECT v.id, v.status, v.reason, v.created_at, v.token_number,
            v.patient_id, v.doctor_id, u.name AS doctor_name, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone,
            p.allergies AS patient_allergies,
            c.id AS consultation_id
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN users u ON u.id = v.doctor_id
       LEFT JOIN consultations c
              ON c.visit_id = v.id AND c.tenant_id = v.tenant_id
      WHERE v.tenant_id = ?
        AND v.status IN ('REGISTERED', 'TRIAGE', 'WITH_DOCTOR')
        AND v.created_at >= CURDATE()
        ${mine}
      ORDER BY v.created_at ASC`,
    BigInt(tid),
    ...mineArgs,
  );
  return json({ visits });
});
