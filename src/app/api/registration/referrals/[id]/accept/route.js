import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToTenant } from "@/lib/realtime";
import { resolveTokenNumber, createVisitWithToken } from "@/lib/tokenOverride";
import { completeInbound } from "@/lib/partners";

export const dynamic = "force-dynamic";

const parse = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
};

// Accept a referred patient: registers them (and opens an OPD visit with a
// queue token) in THIS facility's own records, then tells the sender.
export const POST = apiRoute("visit:create", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "referral_not_found");
  const order = await prisma.peer_inbound_orders.findFirst({ where: { id: BigInt(id), tenant_id: BigInt(session.tenantId) } });
  if (!order || order.order_type !== "REFERRAL") throw new HttpError(404, "referral_not_found");
  if (order.status !== "RECEIVED") throw new HttpError(409, "already_completed");
  const conn = await prisma.org_connections.findUnique({ where: { id: order.org_connection_id }, select: { status: true, requester_tenant_id: true } });
  if (!conn || conn.status !== "ACTIVE") throw new HttpError(409, "connection_not_active");
  const from = (await prisma.tenants.findUnique({ where: { id: conn.requester_tenant_id }, select: { name: true } }))?.name || "a partner";
  const p = parse(order.payload);
  if (!p.patientName) throw new HttpError(422, "referral_missing_patient");

  const tid = requireTenantId();
  const created = await tenantDb.$transaction(async (tx) => {
    const patient = await tx.patients.create({
      data: { name: String(p.patientName).slice(0, 191), age: Number.isFinite(Number(p.patientAge)) ? Number(p.patientAge) : 0, gender: ["MALE", "FEMALE", "OTHER"].includes(p.patientGender) ? p.patientGender : null, phone: String(p.patientPhone || "Referred").slice(0, 32) },
    });
    const { tokenNumber } = await resolveTokenNumber(tx, tid, session.role, {});
    const visit = await createVisitWithToken(
      tx,
      { patient_id: patient.id, status: "REGISTERED", entry_type: "OPD", token_number: tokenNumber, reason: `Referred from ${from}: ${p.reason || ""}`.slice(0, 500), registered_by: BigInt(session.userId) },
      { patients: true },
    );
    return { patient, visit, tokenNumber };
  });
  emitToTenant(session.tenantId, "visit:created", { visit: { ...created.visit, patient_name: created.patient.name, patient_age: created.patient.age, patient_phone: created.patient.phone } });

  await completeInbound(session, id, { referral: { accepted: true, token: created.tokenNumber } }, "");
  return json({ ok: true, token: created.tokenNumber }, 201);
});
