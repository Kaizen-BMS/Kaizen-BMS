import { apiRoute, json } from "@/lib/apiRoute";
import { listInbound } from "@/lib/partners";

export const dynamic = "force-dynamic";

// Patients other hospitals / clinics referred to THIS facility.
export const GET = apiRoute("visit:create", async (request, { session }) => {
  const rows = (await listInbound(session)).filter((o) => o.orderType === "REFERRAL");
  return json({
    referrals: rows.map((o) => ({
      id: o.id,
      from: o.from,
      status: o.status,
      connectionStatus: o.connectionStatus,
      patientName: o.payload.patientName || null,
      patientAge: o.payload.patientAge ?? null,
      patientGender: o.payload.patientGender || null,
      patientPhone: o.payload.patientPhone || null,
      reason: o.payload.reason || null,
      summary: o.payload.summary || null,
      receivedAt: o.receivedAt,
      result: o.result,
    })),
  });
});
