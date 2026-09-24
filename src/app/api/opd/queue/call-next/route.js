import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToTenant, emitToDisplay } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// "Call Next" — advances the oldest waiting visit to WITH_DOCTOR and
// announces it: to staff (visit:updated, full record) and to the public
// waiting-room display (visit.called — token number only, no patient name).
export const POST = apiRoute("consultation:create", async (_request, { session }) => {
  const tid = requireTenantId();
  // A doctor calls their own patients first, then anyone not assigned to a doctor.
  const isDoctor = session.role === "DOCTOR";
  const mine = isDoctor ? "AND (v.doctor_id = ? OR v.doctor_id IS NULL)" : "";
  const mineArgs = isDoctor ? [BigInt(session.userId)] : [];
  const nextRows = await tenantDb.$queryRawUnsafe(
    `SELECT v.id, v.token_number, p.name AS patient_name
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.tenant_id = ?
        AND v.status IN ('REGISTERED', 'TRIAGE')
        AND v.created_at >= CURDATE()
        ${mine}
      ORDER BY (v.doctor_id IS NULL) ASC, v.token_number ASC, v.created_at ASC
      LIMIT 1`,
    BigInt(tid),
    ...mineArgs,
  );
  const next = nextRows[0];
  if (!next) return json({ error: "queue_empty" }, 404);

  await tenantDb.visits.update({ where: { id: next.id }, data: { status: "WITH_DOCTOR", ...(isDoctor ? { doctor_id: BigInt(session.userId) } : {}) } });

  const updated = await tenantDb.visits.findUnique({
    where: { id: next.id },
    include: { patients: { select: { name: true, age: true, phone: true } } },
  });
  const { patients: p, ...rest } = updated;
  const visit = { ...rest, patient_name: p.name, patient_age: p.age, patient_phone: p.phone };

  const doctor = await prisma.users.findUnique({
    where: { id: BigInt(session.userId) },
    select: { name: true },
  });

  emitToTenant(session.tenantId, "visit:updated", { visit });
  emitToDisplay(session.tenantId, "visit.called", {
    tokenNumber: Number(next.token_number),
    room: doctor?.name || "OPD",
  });

  return json({ visit });
});
