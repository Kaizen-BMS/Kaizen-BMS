import { apiRoute, json } from "@/lib/apiRoute";
import { findById, updateById, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToTenant, emitToDisplay } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// "Call Next" — advances the oldest waiting visit to WITH_DOCTOR and
// announces it: to staff (visit:updated, full record) and to the public
// waiting-room display (visit.called — token number only, no patient name).
export const POST = apiRoute("consultation:create", async (_request, { session }) => {
  const next = await scopedQueryOne(
    `SELECT v.id, v.token_number, p.name AS patient_name
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = :tid
        AND v.status IN ('REGISTERED', 'TRIAGE')
        AND v.created_at >= CURDATE()
      ORDER BY v.token_number ASC, v.created_at ASC
      LIMIT 1`,
  );
  if (!next) return json({ error: "queue_empty" }, 404);

  await updateById("visits", next.id, { status: "WITH_DOCTOR" });

  const visit = await scopedQueryOne(
    `SELECT v.*, p.name AS patient_name, p.age AS patient_age, p.phone AS patient_phone
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = :tid AND v.id = :id`,
    { id: next.id },
  );

  const doctor = await findById("users", session.userId, "name");

  emitToTenant(session.tenantId, "visit:updated", { visit });
  emitToDisplay(session.tenantId, "visit.called", {
    tokenNumber: next.token_number,
    room: doctor?.name || "OPD",
  });

  return json({ visit });
});
